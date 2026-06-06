# Farmbright Supabase Migration Build Spec

## Goal

Rebuild Farmbright around Supabase as the backend platform and Supabase Auth as the auth system, removing Flask, Axios, the separate router module, the toast provider, and the large custom CSS dependency. The MVP should preserve the current product shape, current database tables, and visual direction while moving data access, auth, routing, and styling onto the new architecture.

## Current State

- Frontend is Vite + React 19 with `react-router-dom`, `lucide-react`, `recharts`, `react-datepicker`, Tailwind already present, and Axios still installed.
- `src/main.jsx` owns root rendering, global providers, `RouterProvider`, the toast provider, and `ToastContainer`.
- `src/router.jsx` owns the route tree. `src/App.jsx` is effectively unused.
- `src/services/api.js` wraps Axios and injects a Supabase auth token before calling Flask endpoints.
- Feature services call Flask routes for users, onboarding, flocks, scale house, inventory, dashboard, financials, and exports.
- Flask backend owns SQLAlchemy models, migrations, API routes, financial aggregation, export generation, inventory ledger writes, alert dismissal, and DYMO HID scale status/streaming.
- The current database table design is the baseline and should be reused. Supabase work should connect to those existing tables rather than redesigning them from scratch.
- Alembic/Flask migration metadata, including the migrations/version table, is legacy metadata for this rewrite and should be ignored by the Supabase app/data layer.
- Custom CSS in `src/index.css` is very large and already includes Tailwind directives, but most UI uses handwritten class selectors rather than Tailwind utilities or DaisyUI.

## Target Architecture

### Frontend

- `src/App.jsx` is the application entry and route owner.
- Remove `src/main.jsx` and `src/router.jsx`.
- Point `index.html` at `src/App.jsx`, or introduce a single app entry pattern where `App.jsx` owns the render and route tree.
- Use `BrowserRouter`, `Routes`, `Route`, `Navigate`, and layout routes directly from `App.jsx`.
- Keep `AuthProvider` and `FarmProvider`, but remove `ToastProvider` and `ToastContainer`.
- Replace toast usages with inline page state for MVP.
- Remove Axios and `src/services/api.js`.
- Use Supabase client services directly through `@supabase/supabase-js`.
- Use Tailwind utility classes and DaisyUI components for the app shell, cards, forms, buttons, badges, modals, tables, tabs, and alerts.
- After the Supabase Data API cutover is complete, dissolve `frontend/` into the main repo root so the Vite app is the repo-level application instead of living in a nested frontend package.

### Backend

- Remove Flask as an application runtime.
- Supabase Auth is the identity source.
- Supabase Postgres is the database, using the existing table layout as the starting contract.
- Supabase Data API/PostgREST is the primary API surface for CRUD.
- Supabase Row Level Security protects user-owned records.
- Use Postgres views/RPC functions for dashboard summaries, financial summaries, queue summaries, inventory ledger writes, and other multi-table workflows.
- Use Supabase Edge Functions only where PostgREST/RPC is not enough.
- MVP does not include realtime listeners.
- After no backend runtime code remains, remove the `backend/` folder entirely.

### Deferred Or Reworked Capabilities

- DYMO HID scale streaming cannot be carried over directly from Flask. MVP should use manual scale/feed entry or a browser-side WebHID spike later.
- Server-side PDF/XLSX export should be replaced with client-side CSV/XLSX generation for MVP, with PDF and richer exports deferred to an Edge Function or client export library.
- The nightly Flask scheduler should be replaced with computed views/RPC for MVP. If persisted daily aggregates remain necessary, use Supabase Scheduled Functions or pg_cron later.

## Non-Goals For MVP

- Realtime subscriptions.
- Toast notifications.
- Billing implementation.
- Native or daemon-based USB scale bridge.
- Full redesign of the UI.
- Large product behavior changes beyond those needed to remove Flask/Axios and move data/auth to Supabase.

## Sprint Plan

### Sprint 0: Architecture Lock And Supabase Schema Plan

Purpose: make the migration executable before cutting code.

PR 0.1: Existing database baseline and RLS design

- Treat the current database tables as canonical for MVP.
- Connect Supabase/PostgREST to the existing tables rather than creating a redesigned replacement schema.
- Ignore Alembic/Flask migration metadata tables, including the migrations/version table, during app development and data API mapping.
- Inventory the existing tables, foreign keys, indexes, enums/check constraints, uniqueness constraints, and timestamps so the Supabase data contracts match them.
- Add RLS policies so authenticated users can only access their own farm data.
- Add helper SQL functions where ownership is indirect, such as flock ownership through breed -> animal class -> user.

Acceptance criteria:

- Supabase is connected to the current table layout.
- Legacy migration metadata is documented as ignored and is not used by frontend services, RPCs, or RLS decisions.
- RLS blocks cross-user reads and writes.
- Existing app entities have a clear one-to-one data API destination.

PR 0.2: Data contract map

- Document every current service method and its Supabase replacement.
- Mark each replacement as table query, RPC, view, Edge Function, or deferred.
- Identify payload and response shape compatibility gaps.

Acceptance criteria:

- Each function in `src/services/*Api.js` has a migration target.
- Risky workflows are flagged before implementation starts.

### Sprint 1: Frontend Shell And Dependency Reset

Purpose: simplify the frontend foundation without changing product behavior yet.

PR 1.1: App-owned routing

- Move route ownership into `src/App.jsx`.
- Remove `src/router.jsx`.
- Remove `RouterProvider` usage.
- Make layout and protected routes work through nested `Routes`.
- Keep existing pages mounted at their current URLs.
- Update `index.html` and/or app entry so `main.jsx` is no longer used.

Acceptance criteria:

- `/login`, `/onboarding`, `/dashboard`, `/flocks`, `/flocks/:id`, `/scale-house`, `/inventory`, `/financials`, `/export`, `/farm-setup`, and `/settings` still route correctly.
- Protected routes still redirect unauthenticated users.
- Build succeeds without `router.jsx`.

PR 1.2: Remove toast provider

- Remove `ToastContext.jsx` and `ToastContainer.jsx`.
- Remove `ToastProvider` from the app tree.
- Replace `useToast` calls with local inline success/error state on affected pages.
- Keep MVP feedback simple: inline banners, form errors, button loading states.

Acceptance criteria:

- No imports from `ToastContext` or `ToastContainer` remain.
- User actions that previously toasted still show meaningful local feedback.

PR 1.3: Tailwind and DaisyUI foundation

- Install DaisyUI.
- Configure `tailwind.config.js` with DaisyUI plugin and Farmbright theme tokens.
- Keep only Tailwind base/global reset, fonts, and minimal CSS variables in `index.css`.
- Define shared utility conventions for panels, buttons, inputs, badges, and tables.

Acceptance criteria:

- Tailwind and DaisyUI are installed and active.
- The app still visually resembles the current UI direction.
- New styling uses Tailwind/DaisyUI rather than custom page selectors.

### Sprint 2: Supabase Auth And Profile Ownership

Purpose: make auth and farm ownership independent of Flask.

PR 2.1: Auth user to farm profile bridge

- Convert `public.users.supabase_uid` to `uuid` if it is still the legacy `varchar` column.
- Add a foreign key from `public.users.supabase_uid` to `auth.users.id` with `on delete cascade`.
- Add a database trigger on `auth.users` that auto-inserts a matching `public.users` row when a Supabase Auth account is created.
- Pull `farm_name`, `display_name`, and optional preferences from `raw_user_meta_data` during profile creation.
- Add a helper function such as `public.current_app_user_id()` that maps `auth.uid()` to the existing integer `public.users.id`.
- Keep `public.users.id` as the internal integer farm profile key for MVP because existing farm tables already reference it.
- Update frontend signup to pass `farm_name` through Supabase Auth metadata.

Acceptance criteria:

- Creating a Supabase Auth account automatically creates one `public.users` row.
- The profile row has a real FK to `auth.users`.
- Frontend signup no longer depends on a separate profile creation request for the normal happy path.
- Existing `user_id` references can continue using `public.users.id`.

PR 2.2: Auth context cleanup

- Keep Supabase Auth for sign in, sign up, session persistence, sign out, and auth state changes.
- Remove backend user creation calls from `AuthContext`.
- Fetch the profile through Supabase table APIs or an RPC after the DB trigger creates it.
- Store minimal local auth-derived state only when needed.

Acceptance criteria:

- Sign up creates an auth user and farm profile.
- Sign in loads profile and onboarding status without Flask.
- Sign out clears app state.

PR 2.3: Profile and onboarding status APIs

- Replace `usersApi.js` with Supabase profile functions.
- Replace onboarding summary read with Supabase query/RPC.
- Ensure `FarmContext` derives farm name and app user/profile ID from Supabase-backed profile state.

Acceptance criteria:

- Login/signup/settings can read and update farm/account profile data.
- Onboarding redirect behavior still works.

### Sprint 3: Core CRUD And Operational Workflows — COMPLETE

Purpose: move all data workflows from Flask to Supabase Data API and Postgres triggers.

What was built:

- `supabase/migrations/20260606120000_rls_and_triggers.sql` — RLS on all 14 tables, 6 Postgres triggers replicating all SQLAlchemy event listener side effects (feed cost lock, inventory debit, reversal on delete, delta on update, casualty headcount, feed cost sync), and 2 RPCs (`purchase_feed`, `adjust_feed`).
- `onboardingApi.js` — animal class, breed, flock, feed type, and feed assignment CRUD via Supabase table API. `getOnboardingSummary` composes multiple Data API queries in JS.
- `flocksApi.js` — flock list and detail via PostgREST nested selects, feeding/production/casualty history with pagination, `logProduction` and `logCasualty` as table API inserts (triggers handle headcount update).
- `inventoryApi.js` — feed reads, transaction history with running balance, `purchaseFeed`/`adjustFeed` via RPC, feed metadata update and alert dismissal via table API.
- `dashboardApi.js` — 8 parallel Data API queries composed in JS to match the Flask overview shape.
- `financialsApi.js` — farm summary and per-flock P&L as JS-composed aggregations over feeding_events and revenues; revenue CRUD via table API.
- `scaleHouseApi.js` — queue and summary as parallel Data API queries, session logging as sequential inserts (triggers handle side effects), event delete/patch via table API (triggers handle inventory). DYMO scale endpoints stubbed to `connected: false` (hardware bridge deferred).
- `exportApi.js` — stubbed pending Sprint 4.

Key design decisions:
- Postgres triggers replace all Python SQLAlchemy event listeners. Frontend uses plain table API inserts/updates/deletes.
- JS-composed parallel queries replace Flask aggregation endpoints. No views or custom read RPCs.
- `purchase_feed` and `adjust_feed` are the only RPCs, because purchases atomically update the feed, insert a transaction, and clear alerts in one call.
- RLS uses `current_app_user_id()` helper for direct ownership and `user_owns_flock()` / `user_owns_breed()` helper functions for indirect ownership through breeds and animal classes.

### Sprint 4: Exports, Cleanup, And Flask Removal — COMPLETE

Purpose: finish the cutover and remove old runtime paths.

What was built:

- `exportApi.js` — replaced stubs with four real Supabase Data API builders (`fetchFeedingRows`, `fetchProductionRows`, `fetchFinancialRows`, `fetchInventoryRows`). `getExportPreview` returns `{ headers, rows }` for the preview table. `generateExport` produces a CSV string and returns it in an Axios-compatible envelope so `Export.jsx` can trigger a browser download without server involvement. PDF and XLSX throw a user-visible error.
- `Export.jsx` — PDF and XLSX format cards marked `deferred: true`, disabled, and labelled "soon". Error handler updated to read `requestError.message` instead of the old Axios `response.data.message` shape.
- `src/services/api.js` — deleted. Zero active imports remain.
- `package.json` — Axios removed (`npm uninstall axios`).
- `.env` — `VITE_API_BASE_URL` removed.
- `backend/` — contents deleted; empty directory remains (locked by VS Code file watcher, harmless).
- Vite app promoted: `package.json`, `index.html`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `src/`, `public/`, `.env` all moved from `farmbright/frontend/` to `farmbright/`. `npm install` and `npm run build` now run from `farmbright/`.
- `AppLayout.jsx` — converted to Tailwind/DaisyUI inline utilities (sidebar, nav links, sign-out button, layout grid). Removed corresponding CSS blocks from `index.css`. Added `.deferred-tag` style for export format badges.

Key decisions:
- Client-side CSV uses a plain string builder and `URL.createObjectURL`; no library needed.
- Tailwind conversion is incremental. The app shell (`AppLayout.jsx`) is now Tailwind-only. Per-page CSS classes remain in `index.css` for now; they will be converted page-by-page in a follow-up pass without risk of visual regression.
- `backend/` directory stub is not harmful and will disappear when VS Code releases the file handle.

## Suggested PR Order (updated)

All 17 items are complete. Remaining work (future sprint):

- Incremental per-page Tailwind conversion pass (convert each page's CSS class names to inline utilities one page at a time; trim `index.css` as each page is converted).

## Supabase Data Surface Plan (as implemented)

Table API for all simple user-owned CRUD:

- users, animal_classes, breeds, flocks, feed_types, feed_assignments
- production_logs, casualty_logs, breeding_logs, revenues, alerts (dismiss = update is_read)

Postgres triggers handle all side effects (no extra frontend calls needed):

- `feed_types BEFORE INSERT/UPDATE` — sync `cost_per_unit` from `bag_price/bag_weight`
- `casualty_logs AFTER INSERT` — update `flocks.current_headcount`
- `feeding_events BEFORE INSERT` — lock `cost_per_lb_at_time` from current feed cost
- `feeding_events AFTER INSERT` — debit `feed_types.current_on_hand`, create `inventory_transactions` row, generate low-feed alert if at/below par
- `feeding_events BEFORE DELETE` — restore inventory, create reversal transaction
- `feeding_events BEFORE UPDATE OF total_weight, feed_type_id` — restore old inventory, debit new, create 2 transactions, update cost lock

RPCs (only where atomicity requires multiple table changes in one call):

- `purchase_feed` — updates feed balance + bag metadata, creates purchase transaction, clears alerts
- `adjust_feed` — updates feed balance, creates adjustment transaction

JS-composed parallel Data API queries for derived reads:

- Dashboard overview — 8 parallel queries combined in `dashboardApi.js`
- Flock list stats — flock query + feeding aggregate + egg aggregate composed in JS
- Flock detail — 4 parallel queries composed in JS
- Financial summary — feeding + revenue queries aggregated by day in JS
- Scale house queue/summary — flock + today's feeding queries composed in JS

## Testing Strategy

- Add Supabase SQL policy tests or local scripts for RLS ownership checks.
- Add service-layer tests around Supabase query builders where feasible.
- Add smoke tests for auth, routing, onboarding, inventory, scale-house manual logging, and financials.
- Run `npm run build` on every PR.
- Use browser verification for route/navigation regressions after the routing and styling PRs.

## Migration Risks

- Multi-table Flask workflows must become RPCs or transactions; moving them to loose frontend calls risks partial writes.
- RLS must account for indirect ownership, especially flocks through breeds and animal classes.
- Removing Flask removes the current HID scale bridge. Manual entry is the safest MVP path.
- Export generation changes from server-owned to client-owned behavior unless Edge Functions are introduced.
- The current UI is coupled to custom class names, so Tailwind conversion should be incremental and page-by-page.
- App entry through `App.jsx` is possible, but it is less conventional than keeping `main.jsx`; document the Vite entry change clearly.

## Definition Of Done

- No Flask runtime is required locally or in production.
- No `backend/` folder remains after Flask removal is complete.
- No Axios dependency remains.
- Supabase Auth owns sign in, sign up, session persistence, and sign out.
- Supabase Data API/RPC/views own all MVP data reads and writes.
- `App.jsx` owns routing and provider composition.
- `router.jsx`, `main.jsx`, toast provider, and toast container are removed.
- The Vite app lives at the repo root rather than inside `frontend/`.
- Tailwind and DaisyUI are the active styling foundation.
- MVP flows work: auth, onboarding, dashboard, flocks, inventory, scale-house manual logging, financials, settings, and export preview/CSV.
