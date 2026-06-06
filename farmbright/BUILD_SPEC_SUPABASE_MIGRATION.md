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

PR 2.1: Auth context cleanup

- Keep Supabase Auth for sign in, sign up, session persistence, sign out, and auth state changes.
- Remove backend user creation calls from `AuthContext`.
- Create or fetch the profile through Supabase table APIs or an RPC.
- Store minimal local auth-derived state only when needed.

Acceptance criteria:

- Sign up creates an auth user and farm profile.
- Sign in loads profile and onboarding status without Flask.
- Sign out clears app state.

PR 2.2: Profile and onboarding status APIs

- Replace `usersApi.js` with Supabase profile functions.
- Replace onboarding summary read with Supabase query/RPC.
- Ensure `FarmContext` derives farm name and app user/profile ID from Supabase-backed profile state.

Acceptance criteria:

- Login/signup/settings can read and update farm/account profile data.
- Onboarding redirect behavior still works.

### Sprint 3: Core CRUD Migration

Purpose: move normal data workflows from Flask endpoints to Supabase table APIs.

PR 3.1: Onboarding service migration

- Rewrite animal class, breed, flock, feed type, and feed assignment CRUD functions to use Supabase.
- Preserve current page-level payload shapes where reasonable.
- Use transactions/RPC where multi-step writes must be atomic.

Acceptance criteria:

- Onboarding wizard can create, edit, delete, and review setup data.
- Farm setup settings can edit the same entities.
- No onboarding Flask endpoints are used.

PR 3.2: Flocks service migration

- Rewrite flock list, flock detail, feeding history, production history, production logging, and casualty logging with Supabase queries/RPC.
- Move nested detail composition into query helpers, views, or RPCs.

Acceptance criteria:

- Flock list and detail screens work from Supabase.
- Production and casualty logs update current headcount and history correctly.

PR 3.3: Inventory service migration

- Rewrite feed inventory reads, transactions, purchase logging, adjustments, feed updates, alerts, and alert dismissal.
- Use RPC for purchase/feeding/adjustment writes so ledger rows and feed balances update together.

Acceptance criteria:

- Inventory cards, transaction history, low-feed alerts, purchases, adjustments, and feed edits work.
- Feed balance changes are atomic.

### Sprint 4: Operational Workflows And Derived Data

Purpose: replace Flask business logic with Supabase RPC/views.

PR 4.1: Dashboard data migration

- Replace dashboard overview endpoint with Supabase view/RPC.
- Include current KPIs, feeding status, production summary, revenue summary, and alerts.

Acceptance criteria:

- Dashboard renders from Supabase only.
- Alert dismissal still works.

PR 4.2: Scale-house MVP migration

- Replace Flask queue, queue summary, session logging, today events, delete event, and patch event with Supabase queries/RPC.
- Defer live DYMO stream and hardware status.
- Add a visible manual-entry state for MVP where live scale data used to be required.

Acceptance criteria:

- Scale-house workflow can complete feeding sessions manually.
- Feeding sessions update events, inventory transactions, feed balances, and summaries atomically.
- No EventSource or Flask scale endpoint remains in MVP code.

PR 4.3: Financials migration

- Replace summary, flock P/L, revenue creation, and revenue history with Supabase queries/RPC/views.
- Prefer computed summaries over persisted nightly aggregates for MVP.

Acceptance criteria:

- Financial dashboard and revenue modal work without Flask.
- Date filters and flock-level summaries match existing behavior closely.

### Sprint 5: Exports, Cleanup, And Flask Removal

Purpose: finish the cutover and remove old runtime paths.

PR 5.1: Export MVP

- Replace Flask export preview with Supabase query/view.
- Replace CSV/XLSX export generation with client-side generation where practical.
- Defer PDF export or implement a lightweight client-side version.

Acceptance criteria:

- Export page can preview report data.
- At least CSV export works without Flask.
- UI clearly disables or hides deferred export formats.

PR 5.2: Remove Axios and Flask runtime

- Remove Axios dependency.
- Delete `src/services/api.js`.
- Remove all `VITE_API_BASE_URL` usage.
- Remove Flask backend app, routes, models, migrations, Python requirements, Docker Postgres-only development assumptions, and Render Flask deployment config.
- Delete the `backend/` folder once all remaining logic has been replaced by Supabase table APIs, views, RPCs, or deferred MVP decisions.
- Replace backend documentation with Supabase setup/deployment documentation.

Acceptance criteria:

- `rg "axios|VITE_API_BASE_URL|/api/" frontend/src` returns no active Flask API usage.
- `npm run build` succeeds.
- README describes Supabase-only setup.

PR 5.3: Promote frontend to repo root

- Move the Vite app files from `frontend/` into the main repo root after the backend folder has been removed.
- Move `package.json`, `package-lock.json`, `index.html`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, and `src/` to the repo root.
- Update scripts, README paths, GitHub Actions paths, deployment settings, and any root-relative references.
- Remove the now-empty `frontend/` folder.

Acceptance criteria:

- The app installs and builds from the repo root.
- No active docs or workflows point to `farmbright/frontend`.
- The repo layout reflects the Supabase-only app: one Vite app at root, no Flask backend folder.

PR 5.4: Tailwind conversion pass

- Convert remaining page CSS selectors to Tailwind/DaisyUI.
- Delete obsolete custom CSS blocks.
- Keep global CSS limited to Tailwind directives, fonts, root theme variables if needed, and small unavoidable browser fixes.

Acceptance criteria:

- `index.css` is small and intentional.
- Main pages preserve the current UI feel.
- No page depends on the old large selector stylesheet.

## Suggested PR Order

1. Existing database baseline/RLS.
2. Data contract map.
3. App-owned routing.
4. Remove toast provider.
5. Tailwind/DaisyUI foundation.
6. Supabase auth/profile cleanup.
7. Onboarding CRUD.
8. Flocks CRUD/history.
9. Inventory ledger.
10. Dashboard summary.
11. Scale-house manual MVP.
12. Financial summaries/revenue.
13. Export MVP.
14. Remove Axios/Flask runtime.
15. Remove nested frontend folder by promoting the Vite app to repo root.
16. Final Tailwind conversion and docs polish.

## Supabase Data Surface Plan

Use table APIs for simple user-owned CRUD:

- profiles/users
- animal_classes
- breeds
- flocks
- feed_types
- feed_assignments
- production_logs
- casualty_logs
- breeding_logs
- revenues

Use RPC for writes with side effects:

- create_profile_for_auth_user
- get_onboarding_summary
- log_feeding_session
- patch_feeding_event
- delete_feeding_event
- log_inventory_purchase
- log_inventory_adjustment
- log_production
- log_casualty
- dismiss_alert

Use views or RPC for derived reads:

- dashboard_overview
- scale_house_queue
- scale_house_summary
- flock_detail
- flock_feeding_history
- flock_production_history
- financial_summary
- flock_financials
- export_preview

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
