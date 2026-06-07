# FarmBright — Comprehensive Diagnostic Report

**Generated:** 2026-06-06  
**Branch:** restructure  
**Codebase root:** `farmbright/`

---

## SECTION 1 — STACK CONFIRMATION

### Frontend Framework
- **React 19.0.0** with `react-dom` 19.0.0
- **Vite 6.0.6** — build tool and dev server
- **React Router DOM 6.28.2** — client-side routing with `BrowserRouter`
- Entry point: `src/App.jsx` (contains both the `App` component definition and `createRoot` mount — effectively serves as `main.jsx`)

### Backend / API Layer
- **Flask has been fully removed.** There is no running server, no REST API, no proxy.
- All data operations go directly from the browser to **Supabase** via the JS client.
- Two Postgres RPCs handle atomic operations: `purchase_feed` and `adjust_feed`.
- Postgres triggers in Supabase handle all side effects (inventory debits, headcount updates, alert generation, cost locking) — replacing what Flask/SQLAlchemy event listeners previously did.
- A `backend/` directory still exists inside `farmbright/` but was not audited — assumed legacy.
- A `frontend/` directory with its own `node_modules` and `dist` also exists inside `farmbright/` — dead weight from pre-restructure, not part of the active build.

### Database Client
- **`@supabase/supabase-js` 2.107.0**
- Client initialized in `src/services/supabaseClient.js`
- All service files import `supabase` from that single client module
- Access patterns used:
  - `.from(table).select(...)` — direct table reads with Supabase PostgREST
  - `.from(table).insert(...)` / `.update(...)` / `.delete()` — direct mutations
  - `.rpc("purchase_feed", {...})` and `.rpc("adjust_feed", {...})` — two Postgres RPCs
  - `supabase.auth.*` — sign-in, sign-up, sign-out, session management, password update
- No Edge Functions exist. Zero `supabase/functions/` directory.

### Styling System
- **Tailwind CSS 3.4.17**
- **DaisyUI 5.5.20** (devDependency, loaded as a Tailwind plugin)
- **PostCSS 8.4.49** + **Autoprefixer 10.4.20**
- Custom `farmbright` DaisyUI theme defined in `tailwind.config.js`
- Custom CSS properties defined in `src/index.css` `:root` block
- No other UI libraries (no MUI, no Chakra, no shadcn)
- **Recharts 2.15.0** — used for charts in Financials page
- **react-datepicker 7.6.0** — imported as dependency, usage in ScaleHouse page
- **Lucide React 0.468.0** — all icons throughout the app

### Auth System
- **Supabase Auth** — email/password only. No OAuth, no magic links, no SSO.
- Session storage key: `flock-auth-token` (configured in supabase client options)
- Session persisted to localStorage, auto-refreshed via `autoRefreshToken: true`
- Auth state managed in `AuthContext.jsx` using `supabase.auth.onAuthStateChange`
- A custom `public.users` table bridges Supabase Auth UIDs to integer profile IDs. This is because the original Flask app used integer PKs and all farm tables reference `users.id` (integer), not the Supabase UUID.
- `current_app_user_id()` Postgres function maps `auth.uid()` → `public.users.id` for RLS policies.
- Session expiry fires a `flock:auth-expired` custom DOM event; `AuthContext` listens and clears local state.

### package.json — Full Dependency List

**dependencies:**
| Package | Version |
|---|---|
| @supabase/supabase-js | ^2.107.0 |
| lucide-react | ^0.468.0 |
| react | ^19.0.0 |
| react-datepicker | ^7.6.0 |
| react-dom | ^19.0.0 |
| react-router-dom | ^6.28.2 |
| recharts | ^2.15.0 |
| tailwindcss | ^3.4.17 |

**devDependencies:**
| Package | Version |
|---|---|
| @vitejs/plugin-react | ^4.3.4 |
| autoprefixer | ^10.4.20 |
| daisyui | ^5.5.20 |
| postcss | ^8.4.49 |
| supabase | ^2.105.0 |
| vite | ^6.0.6 |

---

## SECTION 2 — PROJECT STRUCTURE

### Full Directory Tree (`farmbright/`, excluding node_modules/dist/.git)

```
farmbright/
├── .env                          ← Supabase env vars (not committed)
├── .gitignore
├── BUILD_SPEC_SUPABASE_MIGRATION.md
├── README.md
├── docker-compose.yml            ← Legacy, not actively used
├── index.html                    ← Vite entry HTML
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── backend/                      ← Legacy Flask backend (not active)
├── frontend/                     ← DEAD: old separate frontend build, has own node_modules
├── public/
│   ├── .gitkeep
│   └── _redirects                ← Netlify SPA routing: /* /index.html 200
├── src/
│   ├── App.jsx                   ← Entry point + router + root render
│   ├── index.css                 ← Global styles, CSS vars, all utility classes
│   ├── components/
│   │   ├── .gitkeep
│   │   ├── AppLayout.jsx         ← Sidebar nav, mobile hamburger drawer
│   │   ├── InlineFeedback.jsx    ← Success/error/warning banners
│   │   └── ProtectedRoute.jsx    ← Auth guard + onboarding gate
│   ├── context/
│   │   ├── AuthContext.jsx       ← Supabase auth state, sign-in/up/out
│   │   └── FarmContext.jsx       ← userId, farmName derived from profile
│   ├── hooks/
│   │   └── .gitkeep              ← Empty, no custom hooks written yet
│   ├── pages/
│   │   ├── animals/
│   │   │   └── .gitkeep          ← PLACEHOLDER — no page component
│   │   ├── auth/
│   │   │   └── Login.jsx
│   │   ├── dashboard/
│   │   │   └── Dashboard.jsx
│   │   ├── feed/
│   │   │   └── .gitkeep          ← PLACEHOLDER — no page component
│   │   ├── finances/
│   │   │   ├── .gitkeep
│   │   │   └── Financials.jsx
│   │   ├── flocks/
│   │   │   ├── FlockDetail.jsx
│   │   │   └── FlockList.jsx
│   │   ├── inventory/
│   │   │   └── Inventory.jsx
│   │   ├── onboarding/
│   │   │   ├── .gitkeep
│   │   │   └── OnboardingWizard.jsx
│   │   ├── production/
│   │   │   └── .gitkeep          ← PLACEHOLDER — no page component
│   │   ├── reports/
│   │   │   ├── .gitkeep
│   │   │   └── Export.jsx
│   │   ├── scale-house/
│   │   │   └── ScaleHouse.jsx
│   │   └── settings/
│   │       ├── .gitkeep
│   │       ├── FarmSetup.jsx
│   │       └── Settings.jsx
│   └── services/
│       ├── authStorage.js        ← localStorage clear, auth-expired event
│       ├── dashboardApi.js       ← getDashboardOverview, dismissInventoryAlert
│       ├── exportApi.js          ← getExportPreview, generateExport (CSV only)
│       ├── financialsApi.js      ← getFinancialSummary, getFlockFinancials, createRevenue, getRevenueHistory
│       ├── flocksApi.js          ← getFlocks, getFlockDetail, logProduction, logCasualty, getFeedingHistory, getProductionHistory
│       ├── inventoryApi.js       ← getInventory, getInventoryAlerts, getFeedTransactions, purchaseFeed, adjustFeed, updateFeed, dismissInventoryAlert
│       ├── onboardingApi.js      ← CRUD for animal_classes, breeds, flocks, feed_types, feed_assignments, getOnboardingSummary
│       ├── scaleHouseApi.js      ← getQueue, getQueueSummary, logSession, getTodayEvents, deleteEvent, patchEvent, getScaleStatus (stub), openScaleStream (stub)
│       ├── supabaseClient.js     ← Single Supabase client instance
│       └── usersApi.js           ← getProfileBySupabaseUid, createProfileForAuthUser, updateUser, updateUserPreferences
└── supabase/
    ├── config.toml
    ├── .temp/                    ← Supabase CLI linked project config
    └── migrations/
        ├── 20260606025334_auth_user_profile_bridge.sql
        └── 20260606120000_rls_and_triggers.sql
```

### Entry Point
`src/App.jsx` — contains the `App` component and the `createRoot` mount call. There is no separate `main.jsx`.

### Router Setup
`BrowserRouter` with `basename={import.meta.env.BASE_URL}`. All routes defined in `App.jsx`:

| Path | Component | Protected |
|---|---|---|
| `/login` | Login | No |
| `/onboarding` | OnboardingWizard | No |
| `/` | → redirects to `/dashboard` | Yes |
| `/dashboard` | Dashboard | Yes |
| `/flocks` | FlockList | Yes |
| `/flocks/:id` | FlockDetail | Yes |
| `/scale-house` | ScaleHouse | Yes |
| `/inventory` | Inventory | Yes |
| `/financials` | Financials | Yes |
| `/export` | Export | Yes |
| `/farm-setup` | FarmSetup | Yes |
| `/settings` | Settings | Yes |

Protected routes are wrapped by `ProtectedRoute` which redirects to `/login` if no user, or `/onboarding` if user exists but `isOnboarded` is false.

### Context Providers
Wrapping order in `App.jsx`:
1. `AuthProvider` — outermost, provides `user`, `profile`, `loading`, `isOnboarded`, `signIn`, `signUp`, `signOut`, `markOnboarded`, `refreshProfile`
2. `FarmProvider` — inside Auth, derives `userId` and `farmName` from `profile`; both also sync to/from localStorage
3. `<div data-theme="farmbright">` — applies DaisyUI theme to the whole tree
4. `BrowserRouter` — innermost wrapper

### Service / API Helper Files
All in `src/services/`:
- `supabaseClient.js` — client singleton, exposes `supabase` and `isSupabaseConfigured`
- `authStorage.js` — `clearLocalAuthState()`, `notifyAuthExpired()`
- `usersApi.js` — profile CRUD against `public.users`
- `dashboardApi.js` — dashboard overview, alert dismiss
- `financialsApi.js` — financial summary, per-flock P&L, revenue CRUD
- `flocksApi.js` — flock list, flock detail, feeding/production/casualty log mutations
- `inventoryApi.js` — inventory list, alerts, transactions, purchase/adjust RPCs
- `onboardingApi.js` — setup CRUD (animal classes, breeds, flocks, feed types, assignments), onboarding summary
- `scaleHouseApi.js` — feeding queue, session logging, event delete/patch, scale hardware stubs
- `exportApi.js` — CSV export for feeding, production, financial, inventory reports

---

## SECTION 3 — SUPABASE INTEGRATION

### Client Initialization
`src/services/supabaseClient.js`
- Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` from environment
- Falls back to placeholder strings if env vars are missing or contain `<user will fill in>`
- `isSupabaseConfigured` boolean exported and checked before auth operations in `AuthContext`
- Session storage key: `flock-auth-token`

### Tables Queried Directly from Frontend
| Table | Operations |
|---|---|
| `users` | SELECT (by supabase_uid), INSERT, UPDATE |
| `animal_classes` | SELECT, INSERT, UPDATE, DELETE |
| `breeds` | SELECT, INSERT, UPDATE, DELETE |
| `flocks` | SELECT, INSERT, UPDATE, DELETE |
| `feed_types` | SELECT, INSERT, UPDATE, DELETE |
| `feed_assignments` | SELECT, INSERT, DELETE |
| `feeding_events` | SELECT, INSERT, UPDATE, DELETE |
| `production_logs` | SELECT, INSERT |
| `casualty_logs` | SELECT, INSERT |
| `inventory_transactions` | SELECT |
| `alerts` | SELECT, UPDATE (is_read) |
| `revenues` | SELECT, INSERT |
| `breeding_logs` | RLS enabled, but NO frontend queries exist |
| `financial_records` | RLS enabled, but NO frontend queries exist |

### Supabase Edge Functions
**None.** No `supabase/functions/` directory exists.

### Supabase RPCs (Postgres Functions)
Two RPCs callable from the frontend:

**`purchase_feed(p_feed_type_id, p_num_bags, p_bag_weight, p_bag_price, p_date, p_supplier)`**
- Atomically: updates `feed_types.current_on_hand`, inserts into `inventory_transactions`, clears related `alerts`
- Returns updated `feed_types` row as JSON
- Called from `inventoryApi.js:purchaseFeed()`

**`adjust_feed(p_feed_type_id, p_quantity_change, p_reason, p_date)`**
- Atomically: updates `feed_types.current_on_hand`, inserts into `inventory_transactions`
- Returns updated `feed_types` row as JSON
- Called from `inventoryApi.js:adjustFeed()`

### Postgres Triggers (replacing Flask side effects)
All defined in migration `20260606120000_rls_and_triggers.sql`:

| Trigger | Table | Event | Effect |
|---|---|---|---|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Creates row in `public.users` |
| `feed_types_sync_cost` | `feed_types` | BEFORE INSERT/UPDATE | Syncs `cost_per_unit = bag_price / bag_weight` |
| `casualty_log_apply_headcount` | `casualty_logs` | AFTER INSERT | Updates `flocks.current_headcount` |
| `feeding_event_lock_cost` | `feeding_events` | BEFORE INSERT | Locks `cost_per_lb_at_time` from current feed price |
| `feeding_event_debit_inventory` | `feeding_events` | AFTER INSERT | Debits `feed_types.current_on_hand`, inserts transaction, creates low-feed alert if needed |
| `feeding_event_restore_on_delete` | `feeding_events` | BEFORE DELETE | Restores inventory, inserts reversal transaction |
| `feeding_event_adjust_inventory` | `feeding_events` | BEFORE UPDATE | Restores old inventory, debits new, inserts both transactions |

### RLS Policies
RLS enabled on all tables listed above. Policy logic:
- `users` — own row only: `id = current_app_user_id()`
- `animal_classes`, `feed_types`, `alerts`, `revenues` — direct `user_id = current_app_user_id()`
- `breeds` — split policies; SELECT/UPDATE/DELETE via `user_owns_breed(id)`, INSERT checks `animal_class_id` is owned
- `flocks`, `feeding_events`, `production_logs`, `casualty_logs`, `breeding_logs`, `financial_records` — `user_owns_flock(flock_id)` helper function
- `feed_assignments`, `inventory_transactions` — via feed_type or flock ownership

### Required Environment Variables
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_KEY=<anon-public-key>
```
Both must be set in `.env` at `farmbright/` root. The `.env` file exists but is gitignored.

---

## SECTION 4 — PAGES AUDIT

### Login (`src/pages/auth/Login.jsx`) → `/login`
- **Data sources:** `supabase.auth.signInWithPassword`, `supabase.auth.signUp` via `AuthContext`
- **Status:** Complete
- **Notes:** Sign-in and sign-up both handled in one component via `mode` state toggle. No forgot-password flow. Email update on Settings account tab calls `updateUser` for display_name/farm_name but does NOT call `supabase.auth.updateUser` — so the email field on Settings is cosmetic only (saved to `public.users.email` but not updated in Supabase Auth).

### OnboardingWizard (`src/pages/onboarding/OnboardingWizard.jsx`) → `/onboarding`
- **Data sources:** `onboardingApi` — creates animal_classes, breeds, flocks, feed_types, feed_assignments
- **Status:** Complete — multi-step wizard
- **Notes:** Not protected by `ProtectedRoute`; redirected to from auth flow. Should verify mobile layout after Tailwind conversion.

### Dashboard (`src/pages/dashboard/Dashboard.jsx`) → `/dashboard`
- **Data sources:** `dashboardApi.getDashboardOverview` — reads `flocks`, `feed_types`, `feeding_events`, `production_logs`, `revenues`, `alerts` in parallel
- **Status:** Complete
- **Notes:** Yesterday's P&L shows net of revenue minus feed cost. KPI numbers use `break-all` for mobile overflow. Feeding panel has compact/expanded toggle. Alert banner dismisses via `dashboardApi.dismissInventoryAlert`.

### FlockList (`src/pages/flocks/FlockList.jsx`) → `/flocks`
- **Data sources:** `flocksApi.getFlocks`, `onboardingApi.getOnboardingSummary` (for add flock modal breed/feed options)
- **Status:** Complete
- **Notes:** `getFlocks()` takes no parameters — RLS scopes results. FlockList calls `getFlocks(userId)` passing userId which is ignored by the function. Not a bug but misleading.

### FlockDetail (`src/pages/flocks/FlockDetail.jsx`) → `/flocks/:id`
- **Data sources:** `flocksApi.getFlockDetail(id)` — reads flock, feeding events, production logs, casualty logs in parallel
- **Status:** Complete
- **Notes:** `showProduction` flag gates production stats and log to layer/breeder flocks only. Headcount timeline is derived client-side from casualty logs. `formatError` function present but `error` display path does not check for `response.data` structure (Supabase errors don't use that format — using `error.message` is correct).

### ScaleHouse (`src/pages/scale-house/ScaleHouse.jsx`) → `/scale-house`
- **Data sources:** `scaleHouseApi.getQueue`, `getQueueSummary`, `logSession`, `getTodayEvents`, `deleteEvent`, `patchEvent`, `getScaleStatus`
- **Status:** Functional in manual mode. Live scale permanently disabled.
- **Notes:** `getScaleStatus()` always returns `{ connected: false }`. `openScaleStream()` always calls `onError`. The DYMO USB HID hardware bridge existed in Flask and has no equivalent in the Supabase-only stack. Page detects `connected: false` and shows manual entry UI. Scale panel and live-read UI are rendered but non-functional hardware paths.

### Inventory (`src/pages/inventory/Inventory.jsx`) → `/inventory`
- **Data sources:** `inventoryApi.getInventory`, `getInventoryAlerts`, `getFeedTransactions`, `purchaseFeed`, `adjustFeed`, `updateFeed`, `dismissInventoryAlert`
- **Status:** Complete
- **Notes:** Purchase and Adjust use Supabase RPCs (atomic). Transaction history scrolls at `max-h-[320px]` with sticky headers. Inline bag stat editing (click-to-edit) updates `feed_types` directly.

### Financials (`src/pages/finances/Financials.jsx`) → `/financials`
- **Data sources:** `financialsApi.getFinancialSummary`, `getFlockFinancials`, `createRevenue`, `getRevenueHistory`
- **Status:** Complete
- **Notes:** Period buttons (Today / This Week / This Month / Custom) now correctly pass date params. Revenue modal for logging income entries. Uses Recharts for feed cost vs revenue chart.

### Export (`src/pages/reports/Export.jsx`) → `/export`
- **Data sources:** `exportApi.getExportPreview`, `generateExport`, `scaleHouseApi.getQueue` (for flock filter list)
- **Status:** Partial — CSV works. PDF and XLSX throw explicit "not yet available" errors.
- **Critical bug:** This page uses CSS class names (`export-page`, `export-config-panel`, `export-format-grid`, `export-option-block`, `export-flock-list`, `export-date-presets`, `export-date-inputs`, `export-preview-panel`, `export-preview-card`, `xlsx-tabs`, `xlsx-header-row`, `recent-exports`, `export-format-badge`) that do not exist in `index.css`. The page has no styling. It was not converted during the Tailwind migration.
- **Notes:** Recent exports stored in `localStorage` key `Flock_recent_exports`. Export filename pattern: `Flock_{reportType}_{date}.{format}`.

### FarmSetup (`src/pages/settings/FarmSetup.jsx`) → `/farm-setup`
- **Data sources:** `onboardingApi.getOnboardingSummary`, plus update/delete functions for all entity types
- **Status:** Complete
- **Notes:** Animal class and breed titles now use `display-font` (DM Serif Display) at 28px and 20px respectively. Settings panel border is 2px solid `--accent-primary`.

### Settings (`src/pages/settings/Settings.jsx`) → `/settings`
- **Data sources:** `usersApi.updateUser`, `updateUserPreferences`, `supabase.auth.updateUser` (password only)
- **Status:** Complete except email update and notification delivery
- **Notes:** Four tabs: Account, Farm, Notifications, Billing. Billing tab is a placeholder stub. Notification preferences (email_alerts, daily_summary_email) are saved to `users.preferences` JSONB column but there is no email delivery infrastructure — no edge function, no cron, no third-party email service wired up. Time zone dropdown shows 6 US zones only.

---

## SECTION 5 — COMPONENTS AUDIT

### `src/components/AppLayout.jsx`
- **What it does:** Main app shell. Renders the sidebar nav on desktop. On mobile (`< lg` / 1024px), collapses to a fixed top bar with a hamburger button that opens a slide-in drawer. Backdrop closes the drawer. Uses `useLocation` to close drawer on route change. Renders `<Outlet />` for page content.
- **Used by:** All protected routes (wraps them in the router config)

### `src/components/InlineFeedback.jsx`
- **What it does:** Renders a DaisyUI `alert` div (`alert-error`, `alert-success`, `alert-info`, `alert-warning`) when a `message` prop is present. Returns null if no message.
- **Used by:** Dashboard, FlockList, FlockDetail, FarmSetup, Settings
- **Note:** Uses DaisyUI alert component classes. These render correctly with the `farmbright` theme but the styling is DaisyUI-driven, not custom — color output depends on DaisyUI theme variables.

### `src/components/ProtectedRoute.jsx`
- **What it does:** Reads `user`, `loading`, `isOnboarded` from `AuthContext`. Shows spinner while loading. Redirects to `/login` if no user. Redirects to `/onboarding` if user exists but not onboarded. Renders `<Outlet />` if authenticated and onboarded.
- **Used by:** App.jsx — wraps all app routes

---

## SECTION 6 — STYLING AUDIT

### CSS Custom Properties
All defined in `src/index.css` inside `:root`:

```css
--bg-base:       #0f1a0f   /* darkest background */
--bg-surface:    #162416   /* card/panel backgrounds */
--bg-elevated:   #1e321e   /* elevated elements (modal inputs, stat chips) */
--accent-primary: #4caf50  /* green CTA, active states */
--accent-muted:   #2e7d32  /* borders */
--accent-warn:    #ff8f00  /* orange warnings */
--accent-danger:  #c62828  /* red errors/delete */
--text-primary:  #e8f5e9   /* near-white, main text */
--text-secondary: #a5d6a7  /* sage green, secondary labels */
--text-muted:    #6ea871   /* lighter sage, tertiary — recently raised from #558b5a */
--border:        #2e7d32   /* default border color */
```

### DaisyUI Theme Interaction
DaisyUI v5 `farmbright` theme is defined in `tailwind.config.js`. It maps DaisyUI semantic tokens (`primary`, `base-100`, etc.) to the same green palette. The `data-theme="farmbright"` attribute is set on the root `<div>` in `App.jsx`. DaisyUI generates its own CSS custom properties (e.g., `--color-primary`) from this theme config — these are separate from the app's custom `--bg-base` etc. variables. There is no namespace conflict but there is a specificity interaction: DaisyUI base layer styles on elements like `h2`, `label`, `p` can override Tailwind utility classes at lower specificity. This was the root cause of modal label text being invisible (fixed by pinning explicit `text-[#e8f5e9]` on the modal wrapper div).

### Hardcoded Hex Values Outside `index.css`
These appear in JSX files as Tailwind arbitrary values:

- **`#e8f5e9`** — near-white text, used in: `Inventory.jsx` (ModalFrame, FormField), `FlockList.jsx` (close button), `FlockDetail.jsx` (close button), `Financials.jsx` (close button), `FarmSetup.jsx` (panel titles), `Login.jsx` (label text, input text)
- **`#a5d6a7`** — sage green hint text, used in: `Inventory.jsx` (FormField hints)
- **`#071107`** — near-black for dark-on-light buttons: `Inventory.jsx` (primary button text, check icon), `FlockList.jsx` (designation badge active state)
- **`rgba(198,40,40,0.18)` / `rgba(198,40,40,0.7)`** — red hover on close buttons, used in all 4 modal close buttons
- **`rgba(76,175,80,0.18)` / `rgba(76,175,80,0.26)`** — green focus ring and hover glow, used in `Inventory.jsx`, `FlockList.jsx`
- **`rgba(46,125,50,0.55)` / `rgba(46,125,50,0.65)`** — subtle green borders on inventory stat cells
- **`#90caf9`** — blue tint for "feeding" transaction type badge in `Inventory.jsx`

### Known Specificity Conflicts / Workarounds
1. **`.field span` overrides Tailwind color on spans** — `.field label, .field span { color: var(--text-secondary); font-size: 12px; }` has specificity `[0,1,1]`, beating Tailwind's `[0,1,0]`. Inventory's `FormField` component avoids this by not using the `.field` CSS class and hardcoding hex values directly.
2. **DaisyUI element rules vs Tailwind utilities on modal content** — DaisyUI base styles can set colors on `h2`, `p`, `label` at a specificity that beats Tailwind utility classes. Fixed by adding explicit `text-[#e8f5e9]` on the Inventory `ModalFrame` wrapper div so it cascades authoritatively to all children.

### Responsive Breakpoints
- **`lg` (1024px)** — primary breakpoint for sidebar collapse, grid layout switches, padding switches
- **`sm` (640px)** — used in flock/inventory grid (`sm:grid-cols-2`)
- **`xl` (1280px)** — used in flock/inventory grid (`xl:grid-cols-3`)
- **`max-[980px]:`** — used in ScaleHouse for bottom nav offset (legacy, may be removable)
- All `style={{ gridTemplateColumns }}` inline props have been replaced with Tailwind `className` equivalents across Dashboard, Financials, FlockList, FlockDetail, ScaleHouse.

---

## SECTION 7 — MOBILE / PWA STATUS

### manifest.json
**Does not exist.** No web app manifest. Not installable as a PWA.

### Service Worker
**Does not exist.** No offline support, no caching strategy.

### Mobile Bottom Nav
**Does not exist** as a standalone component. ScaleHouse has a `fixed bottom-0` daily log panel bar that acts as a bottom strip on mobile.

### Sidebar Responsiveness
**Implemented.** `AppLayout.jsx` handles this:
- `< lg`: Fixed top bar (h-14, z-60) with hamburger `<Menu>` icon. Sidebar slides in from left (`translate-x-0` / `-translate-x-full`). Black backdrop overlay. Close X inside sidebar header.
- `>= lg`: Sidebar is always visible in a CSS grid layout (`240px + minmax(0,1fr)`).
- `useLocation` closes the drawer on route change.

### Pages Verified on Mobile
Based on changes made during Tailwind conversion — the following have been converted and should work on mobile:
- Dashboard (KPI grid, feeding panel, chart row all responsive)
- Financials (KPI grid, chart row, sticky header offset)
- FlockList (card grid responsive)
- FlockDetail (stat grid, main/aside layout responsive)
- Inventory (card grid responsive, modals max-w constrained)
- ScaleHouse (bottom bar offset fixed)

**Not verified on mobile (no explicit conversion tracked):**
- Login
- OnboardingWizard
- FarmSetup
- Settings
- Export (also missing all CSS — not styled at all)

---

## SECTION 8 — WHAT IS WORKING

The following features are confirmed end-to-end with real Supabase data:

1. **Authentication** — Sign in, sign up, sign out, session persistence, session refresh, expired-session handling
2. **Onboarding wizard** — Creates animal classes, breeds, flocks, and feed types with assignments; redirects to dashboard on completion
3. **Dashboard** — Loads today's feeding status per flock, yesterday's P&L, feed stock meters, low-feed alerts with dismiss
4. **Flock list** — All flocks with breed, headcount, fed-today status, all-time cost, all-time eggs
5. **Flock detail** — Recent feedings table, production log table, headcount history timeline, assigned feeds panel, flock info
6. **Log production** — Inserts into `production_logs` via modal on FlockDetail
7. **Log headcount change** — Inserts into `casualty_logs`; Postgres trigger updates `flocks.current_headcount`
8. **Scale house / feeding queue** — Lists flocks with fed/pending status, manual weight entry, logs feeding event; Postgres trigger debits inventory and creates transaction
9. **Today events panel** — Shows all feedings logged today with per-flock breakdown
10. **Delete / patch feeding event** — Postgres trigger restores inventory on delete; handles weight/feed changes on update
11. **Inventory page** — Feed cards with stock meter, on-hand/bag/cost stats, inline bag editing
12. **Purchase feed** — RPC atomically adds stock, records transaction, clears alerts
13. **Adjust feed** — RPC atomically adjusts stock with audit trail transaction
14. **Transaction history** — Per-feed scrollable ledger with running balance computed client-side
15. **Low-feed alerts** — Generated by trigger, displayed on Dashboard and Inventory, dismissible
16. **Financials — period switching** — Today / This Week / This Month / Custom all correctly scope date ranges
17. **Financials — revenue logging** — Create revenue entries linked optionally to a flock
18. **Financials — charts** — Feed cost vs revenue line chart (Recharts), per-flock P&L table
19. **Export — CSV** — Feeding log, production log, financial summary, inventory snapshot all export as downloadable CSV
20. **Farm Setup** — Edit/delete animal classes, breeds, flocks, feed types; inline name editing; collapsible accordion panels
21. **Settings — account** — Update display name; change password via `supabase.auth.updateUser`
22. **Settings — farm** — Update farm name, time zone preference
23. **Settings — notifications** — Save preference flags to `users.preferences` JSONB
24. **Netlify SPA routing** — `public/_redirects` routes all paths to `index.html`

---

## SECTION 9 — WHAT IS BROKEN OR INCOMPLETE

### Critical

**1. Export page has no styling**
`src/pages/reports/Export.jsx` uses CSS classes that do not exist anywhere in the codebase: `export-page`, `export-config-panel`, `export-format-grid`, `export-option-block`, `export-preview-panel`, `export-preview-card`, `recent-exports`, `export-format-badge`, `xlsx-tabs`, `xlsx-header-row`. The page will render unstyled. It was not converted during the Tailwind migration.

**2. Live scale hardware permanently removed**
`scaleHouseApi.js:364-371` — `getScaleStatus()` always returns `{ connected: false }` and `openScaleStream()` always fires `onError`. The DYMO USB HID bridge existed in Flask. There is no replacement path defined.

### Broken / Non-functional Features

**3. PDF and XLSX export throw errors**
`exportApi.js:29-30` — `generateExport` throws `"${format.toUpperCase()} export is not yet available"` for both `pdf` and `xlsx`. These are listed in the UI as options (grayed with "soon" badge) but clicking them via the format selector and then Generate will produce an error banner.

**4. Email update on Settings does not update Supabase Auth**
`Settings.jsx:54` — `saveAccount()` calls `updateUser(profile.id, { display_name, farm_name })` which updates `public.users`. It does NOT call `supabase.auth.updateUser({ email })`. So the email field in the Account tab appears editable but saving it only updates `public.users.email`, not the actual auth identity. Login still uses the old email.

**5. Notification preferences not delivered**
`Settings.jsx` — Email alerts (`email_alerts`, `daily_summary_email`) are saved to `users.preferences` but there is no edge function, cron job, or third-party email integration. The toggles work as preference flags but produce no emails.

**6. `getFlocks` receives `userId` argument it ignores**
`FlockList.jsx:31` calls `getFlocks(userId)`. `flocksApi.js:12` defines `getFlocks()` with no parameters. The argument is silently dropped. RLS handles scoping correctly, but the call signature is misleading.

**7. `Export.jsx` passes `user_id` to functions that ignore it**
`Export.jsx:43` — `getQueue(userId)`. `scaleHouseApi.js:16` — `getQueue()` takes no params. Same pattern as above. Silently ignored.

**8. `breeding_logs` table — RLS configured, no UI**
RLS is enabled with `user_owns_flock` policy but there are zero frontend queries against this table.

**9. `financial_records` table — RLS configured, no UI**
Same as above.

### Incomplete / Placeholder

**10. Placeholder page directories with no components**
- `src/pages/animals/` — only `.gitkeep`
- `src/pages/feed/` — only `.gitkeep`
- `src/pages/production/` — only `.gitkeep`
These directories are in the router's implicit future scope but have no routes defined and no components.

**11. `src/hooks/` is empty**
`.gitkeep` only. No custom hooks exist.

**12. Settings — Billing tab is a stub**
Renders a static "Free" plan card with "Upgrade to Pro - coming soon" text. No Stripe, no plan gating, no payment integration.

**13. Time zone setting has no effect on data**
`Settings.jsx` saves `time_zone` to `users.preferences`. No part of the frontend or backend reads this preference to adjust date display or query behavior. All dates are shown in the browser's local time.

**14. `docker-compose.yml` — likely stale**
References the old Flask stack. Not audited but probably not usable as-is.

**15. Legacy `frontend/` directory**
`farmbright/frontend/` has its own `node_modules`, `dist`, `package.json`. This is the old pre-restructure frontend build. It is dead weight and could cause confusion. Should be deleted.

### Minor Issues

**16. `Settings.jsx` — `currentPassword` field collected but not used**
`Settings.jsx:67-82` — The UI shows a "Current password" input and stores it in state, but `updatePassword()` only calls `supabase.auth.updateUser({ password: newPassword })`. Current password is never verified client-side or passed to Supabase. Supabase's `updateUser` does not require the current password for authenticated users — so the field is purely decorative.

**17. InlineFeedback uses DaisyUI alert classes**
`InlineFeedback.jsx:4-8` — uses `alert alert-error`, `alert alert-success` etc. These depend on DaisyUI rendering correctly with the `farmbright` theme. If DaisyUI theme variables change, feedback styling changes. Not a bug today but worth noting as a coupling point.

**18. `getFlockDetail` `formatError` references Flask-style response shape**
`FlockDetail.jsx:378` — `formatError` checks `error?.response?.data?.message`. Supabase errors don't use `response.data` — they have `error.message` directly. The function correctly falls back to `error.message` so it works, but the first two checks will always be undefined. Dead code paths.

---

## SECTION 10 — OPEN QUESTIONS

**1. What should happen when the live scale is reconnected?**
The DYMO USB HID bridge was removed with Flask. Is hardware scale support a future goal? If so, what is the plan — a separate Electron app, a local HTTP bridge, a Web HID API implementation? ScaleHouse renders a "scale mode" UI panel that currently shows nothing useful.

**2. Should `breeding_logs` and `financial_records` have UI?**
Both tables have RLS policies configured. Are these planned features for a future sprint, or should they be removed from the migration to reduce confusion?

**3. What is the email delivery strategy for notifications?**
Notification preferences save to the database but nothing sends emails. Is a Supabase Edge Function the plan? A third-party service like Resend or SendGrid? Until this is decided, the Notifications tab settings create a false expectation for users.

**4. Should the `frontend/` legacy directory be deleted?**
It has its own `node_modules` and `dist` and contributes nothing to the active build. It could cause confusion for anyone looking at the project structure.

**5. How should email changes be handled in Settings?**
Currently the email field in Account tab only updates `public.users.email`. To change the actual login email, `supabase.auth.updateUser({ email })` must be called, which sends a confirmation email to the new address. This requires a deliberate UX decision (confirm current password, show pending state, etc.).

**6. Is the time zone preference meant to affect anything?**
It's saved but nothing reads it. If date-sensitive displays (feeding events, production logs) should be shown in the farm's local timezone rather than the browser's, this needs an implementation decision.

**7. Is PWA / offline support planned?**
No manifest, no service worker. For a farm management app used in areas with poor connectivity, offline-first capability would be high value. This is a significant architectural decision if added later.

**8. What are the plans for the placeholder routes (animals, feed, production)?**
These directory stubs exist but have no routes or components. Are these next-sprint items? Removing the directories would keep the project structure honest.

**9. Should Export.jsx be Tailwind-converted?**
It's the only page that missed the Tailwind migration. It currently renders with zero styling. Does it get the same treatment as the other pages, or is it being redesigned?

**10. Is the billing / Pro plan upgrade path defined?**
The Billing tab is a static stub. Is Stripe the target? Is there a defined feature set for Pro? The `users.preferences` JSONB column could store plan tier but nothing reads or enforces it today.
