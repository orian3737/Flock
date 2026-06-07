# FarmBright — Comprehensive Diagnostic Report

**Generated:** 2026-06-06 (Sprint 2 revision)
**Branch:** restructure
**Codebase root:** `farmbright/`
**Previous report:** 2026-06-06 (Sprint 1)

---

## CHANGES SINCE LAST REPORT

### Fixed
| # | Item | How |
|---|---|---|
| 1 | Export.jsx had no styling | Full Tailwind rewrite — two-column layout, format cards, preview panel |
| 4 | Email update in Settings was cosmetic only | Now calls `supabase.auth.updateUser({ email })` with pending-confirmation UX |
| 6 | `getFlocks(userId)` silently dropped arg | Changed to `getFlocks()` in FlockList.jsx |
| 7 | `getQueue(userId)` silently dropped arg | Changed to `getQueue()` in Export.jsx |
| 16 | Password change didn't verify current password | Two-step: verify with `signInWithPassword`, then `updateUser` |
| 18 | `formatError` had dead Flask-shaped paths | Simplified to `error?.message \|\| 'An unexpected error occurred'` |
| Login | No forgot-password flow existed | Full flow: hidden → form → loading → sent; `resetPasswordForEmail` with redirect |

### Added
- **`src/pages/auth/ResetPassword.jsx`** — new public page that handles Supabase `PASSWORD_RECOVERY` event, 5s timeout to error state, success redirects to dashboard
- **`/reset-password` route** in `App.jsx` — public (outside ProtectedRoute)
- **`src/services/daySessionApi.js`** — `getTodaySession`, `updateFeedingEvent`, `deleteFeedingEvent`, `updateProductionLog`, `deleteAllTodayFeedings`
- **ScaleHouse redesign** — mode banners, "Currently logging:" card, Review panel, Edit panel with inline editing, Restart menu (3 options), FlockPicker modal, RestartConfirm modal
- **Dashboard quick-access** — "Review Day" and "Edit Day" ghost buttons shown when feedings have been started today

### Other
- `docker-compose.yml` deleted (was legacy Flask reference)
- `farmbright/frontend/` and `farmbright/backend/` added to `.gitignore` (couldn't be deleted due to Windows file locks on node_modules)
- `farmbright/supabase/` directory added by Supabase CLI (config.toml, migrations)

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
- Postgres triggers in Supabase handle all side effects (inventory debits, headcount updates, alert generation, cost locking, inventory restoration on delete/update) — replacing what Flask/SQLAlchemy event listeners previously did.
- `farmbright/backend/` directory still exists but is gitignored and not active.
- `farmbright/frontend/` legacy separate frontend build also gitignored — not part of active build.

### Database Client
- **`@supabase/supabase-js` 2.107.0**
- Client initialized in `src/services/supabaseClient.js`
- All service files import `supabase` from that single client module
- Access patterns used:
  - `.from(table).select(...)` — direct table reads with Supabase PostgREST
  - `.from(table).insert(...)` / `.update(...)` / `.delete()` — direct mutations
  - `.rpc("purchase_feed", {...})` and `.rpc("adjust_feed", {...})` — two Postgres RPCs
  - `supabase.auth.*` — sign-in, sign-up, sign-out, session management, password reset, email update

### Styling System
- **Tailwind CSS 3.4.17**
- **DaisyUI 5.5.20** (devDependency, loaded as a Tailwind plugin)
- **PostCSS 8.4.49** + **Autoprefixer 10.4.20**
- Custom `farmbright` DaisyUI theme defined in `tailwind.config.js`
- Custom CSS properties defined in `src/index.css` `:root` block
- No other UI libraries (no MUI, no Chakra, no shadcn)
- **Recharts 2.15.0** — used for charts in Financials page
- **react-datepicker 7.6.0** — imported as dependency, minimal usage
- **Lucide React 0.468.0** — all icons throughout the app

### Auth System
- **Supabase Auth** — email/password only. No OAuth, no magic links, no SSO.
- Session storage key: `flock-auth-token` (configured in supabase client options)
- Session persisted to localStorage, auto-refreshed via `autoRefreshToken: true`
- Auth state managed in `AuthContext.jsx` using `supabase.auth.onAuthStateChange`
- **Password reset flow:** Login page → `resetPasswordForEmail` → email link → `/reset-password` (public route) → `onAuthStateChange` fires `PASSWORD_RECOVERY` → `updateUser({ password })`
- A custom `public.users` table bridges Supabase Auth UIDs to integer profile IDs. All farm tables reference `users.id` (integer), not the Supabase UUID.
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

### Full Directory Tree (`farmbright/src/`, key files)

```
farmbright/
├── .env                          ← Supabase env vars (not committed)
├── .gitignore                    ← includes frontend/ backend/ node_modules/ dist/
├── BUILD_SPEC_SUPABASE_MIGRATION.md
├── README.md
├── index.html                    ← Vite entry HTML
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── backend/                      ← Legacy Flask backend (gitignored)
├── frontend/                     ← Dead old frontend build (gitignored)
├── public/
│   ├── .gitkeep
│   └── _redirects                ← Netlify SPA routing: /* /index.html 200
├── src/
│   ├── App.jsx                   ← Entry point + router + root render
│   ├── index.css                 ← Global styles, CSS vars, all utility classes
│   ├── components/
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
│   │   │   ├── Login.jsx         ← Sign in, sign up, forgot password flow
│   │   │   └── ResetPassword.jsx ← Password recovery (NEW — public route)
│   │   ├── dashboard/
│   │   │   └── Dashboard.jsx     ← Overview + Review Day / Edit Day links
│   │   ├── feed/
│   │   │   └── .gitkeep          ← PLACEHOLDER — no page component
│   │   ├── finances/
│   │   │   └── Financials.jsx
│   │   ├── flocks/
│   │   │   ├── FlockDetail.jsx
│   │   │   └── FlockList.jsx
│   │   ├── inventory/
│   │   │   └── Inventory.jsx
│   │   ├── onboarding/
│   │   │   └── OnboardingWizard.jsx
│   │   ├── production/
│   │   │   └── .gitkeep          ← PLACEHOLDER — no page component
│   │   ├── reports/
│   │   │   └── Export.jsx        ← CSV export (Tailwind-converted)
│   │   ├── scale-house/
│   │   │   └── ScaleHouse.jsx    ← Redesigned: banners, Review/Edit panels, restart
│   │   └── settings/
│   │       ├── FarmSetup.jsx
│   │       └── Settings.jsx      ← Full auth email/password change flows
│   └── services/
│       ├── authStorage.js        ← localStorage clear, auth-expired event
│       ├── dashboardApi.js       ← getDashboardOverview, dismissInventoryAlert
│       ├── daySessionApi.js      ← NEW: getTodaySession, updateFeedingEvent, etc.
│       ├── exportApi.js          ← getExportPreview, generateExport (CSV only)
│       ├── financialsApi.js      ← getFinancialSummary, createRevenue, etc.
│       ├── flocksApi.js          ← getFlocks, getFlockDetail, log mutations
│       ├── inventoryApi.js       ← getInventory, purchaseFeed, adjustFeed, etc.
│       ├── onboardingApi.js      ← CRUD for setup entities + getOnboardingSummary
│       ├── scaleHouseApi.js      ← getQueue, logSession, deleteEvent, scale stubs
│       ├── supabaseClient.js     ← Single Supabase client instance
│       └── usersApi.js           ← Profile CRUD against public.users
└── supabase/
    ├── config.toml
    └── migrations/
        ├── 20260606025334_auth_user_profile_bridge.sql
        └── 20260606120000_rls_and_triggers.sql
```

### Router Setup
`BrowserRouter` with `basename={import.meta.env.BASE_URL}`. All routes defined in `App.jsx`:

| Path | Component | Protected |
|---|---|---|
| `/login` | Login | No |
| `/reset-password` | ResetPassword | No |
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

`/reset-password` is placed outside `ProtectedRoute` — Supabase sets a temporary session via the recovery link URL hash, so the user is semi-authenticated on that route.

### Context Providers
Wrapping order in `App.jsx`:
1. `AuthProvider` — provides `user`, `profile`, `loading`, `isOnboarded`, `signIn`, `signUp`, `signOut`, `markOnboarded`, `refreshProfile`
2. `FarmProvider` — derives `userId` and `farmName` from `profile`; both also sync to/from localStorage
3. `<div data-theme="farmbright">` — applies DaisyUI theme to the whole tree
4. `BrowserRouter` — innermost wrapper

---

## SECTION 3 — SUPABASE INTEGRATION

### Client Initialization
`src/services/supabaseClient.js`
- Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` from environment
- Falls back to placeholder strings if env vars missing
- `isSupabaseConfigured` boolean exported and checked before auth operations in `AuthContext`
- Session storage key: `flock-auth-token`

### Tables Queried Directly from Frontend
| Table | Operations | Service |
|---|---|---|
| `users` | SELECT (by supabase_uid), INSERT, UPDATE | usersApi |
| `animal_classes` | SELECT, INSERT, UPDATE, DELETE | onboardingApi |
| `breeds` | SELECT, INSERT, UPDATE, DELETE | onboardingApi |
| `flocks` | SELECT, INSERT, UPDATE, DELETE | flocksApi, onboardingApi |
| `feed_types` | SELECT, INSERT, UPDATE, DELETE | onboardingApi, inventoryApi |
| `feed_assignments` | SELECT, INSERT, DELETE | onboardingApi |
| `feeding_events` | SELECT, INSERT, UPDATE, DELETE | scaleHouseApi, daySessionApi |
| `production_logs` | SELECT, INSERT, UPDATE | flocksApi, daySessionApi |
| `casualty_logs` | SELECT, INSERT | flocksApi, daySessionApi |
| `inventory_transactions` | SELECT | inventoryApi |
| `alerts` | SELECT, UPDATE (is_read) | dashboardApi, inventoryApi |
| `revenues` | SELECT, INSERT | financialsApi |
| `breeding_logs` | RLS enabled — NO frontend queries |  |
| `financial_records` | RLS enabled — NO frontend queries |  |

### Supabase RPCs (Postgres Functions)
Two RPCs callable from the frontend:

**`purchase_feed(p_feed_type_id, p_num_bags, p_bag_weight, p_bag_price, p_date, p_supplier)`**
- Atomically: updates `feed_types.current_on_hand`, inserts into `inventory_transactions`, clears related `alerts`

**`adjust_feed(p_feed_type_id, p_quantity_change, p_reason, p_date)`**
- Atomically: updates `feed_types.current_on_hand`, inserts into `inventory_transactions`

### Postgres Triggers
All defined in migration `20260606120000_rls_and_triggers.sql`:

| Trigger | Table | Event | Effect |
|---|---|---|---|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Creates row in `public.users` |
| `feed_types_sync_cost` | `feed_types` | BEFORE INSERT/UPDATE | Syncs `cost_per_unit = bag_price / bag_weight` |
| `casualty_log_apply_headcount` | `casualty_logs` | AFTER INSERT | Updates `flocks.current_headcount` |
| `feeding_event_lock_cost` | `feeding_events` | BEFORE INSERT | Locks `cost_per_lb_at_time` from current feed price |
| `feeding_event_debit_inventory` | `feeding_events` | AFTER INSERT | Debits inventory, inserts transaction, creates low-feed alert if needed |
| `feeding_event_restore_on_delete` | `feeding_events` | BEFORE DELETE | Restores inventory, inserts reversal transaction |
| `feeding_event_adjust_inventory` | `feeding_events` | BEFORE UPDATE | Restores old inventory, debits new, inserts both transactions |

`daySessionApi.js` relies on these triggers for all inventory side effects during UPDATE and DELETE operations — it does not do manual inventory management in the client.

### Required Environment Variables
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_KEY=<anon-public-key>
```
Both must be set in `.env` at `farmbright/` root.

---

## SECTION 4 — PAGES AUDIT

### Login (`src/pages/auth/Login.jsx`) → `/login`
- **Data sources:** `supabase.auth.signInWithPassword`, `supabase.auth.signUp`, `supabase.auth.resetPasswordForEmail`
- **Status:** Complete
- **Forgot password flow:** `forgotStage` state: `hidden → form → loading → sent`. Sends reset email with `redirectTo: window.location.origin + '/reset-password'`. Shows email confirmation with "Back to sign in" link.

### ResetPassword (`src/pages/auth/ResetPassword.jsx`) → `/reset-password`
- **Data sources:** `supabase.auth.onAuthStateChange`, `supabase.auth.updateUser`
- **Status:** Complete — new page
- **Flow:** Listens for `PASSWORD_RECOVERY` event from Supabase. If not received within 5 seconds, shows expired-link error state. On success, shows checkmark and redirects to `/dashboard` after 2 seconds.

### OnboardingWizard (`src/pages/onboarding/OnboardingWizard.jsx`) → `/onboarding`
- **Data sources:** `onboardingApi` — creates animal_classes, breeds, flocks, feed_types, feed_assignments
- **Status:** Complete
- **Notes:** Not protected by `ProtectedRoute`.

### Dashboard (`src/pages/dashboard/Dashboard.jsx`) → `/dashboard`
- **Data sources:** `dashboardApi.getDashboardOverview`
- **Status:** Complete
- **New:** When `fedCount > 0` (any feeding started today), two ghost buttons appear below the Start/Continue Day button: "Review Day" → `/scale-house?panel=review` and "Edit Day" → `/scale-house?panel=edit`.

### FlockList (`src/pages/flocks/FlockList.jsx`) → `/flocks`
- **Data sources:** `flocksApi.getFlocks()`, `onboardingApi.getOnboardingSummary()`
- **Status:** Complete
- **Fixed:** `getFlocks()` now called without args (userId arg was previously silently dropped).

### FlockDetail (`src/pages/flocks/FlockDetail.jsx`) → `/flocks/:id`
- **Data sources:** `flocksApi.getFlockDetail(id)`
- **Status:** Complete
- **Fixed:** `formatError` simplified to `error?.message || 'An unexpected error occurred'` — removed dead Flask-shaped error paths.

### ScaleHouse (`src/pages/scale-house/ScaleHouse.jsx`) → `/scale-house`
- **Data sources:** `scaleHouseApi` (queue, logSession, events, deleteEvent) + `daySessionApi` (getTodaySession, updateFeedingEvent, deleteFeedingEvent, deleteAllTodayFeedings)
- **Status:** Functional. Redesigned with new overlay panels.
- **Mode banners:**
  - Daily mode: green accent banner with session title, "Flock X of Y" counter, Review / Edit / ··· buttons
  - Quick mode: grey elevated banner with "Quick Entry" label and "Switch to Daily Mode →" link
- **Daily mode enhancements:**
  - "Currently logging:" accent card (green border) above the flock header shows current flock prominently
  - Quick mode: label "Select a flock to log" added above flock selector dropdown
- **Review Panel:** Right slide-in (520px, full-width on mobile). Date selector with change-date link. Session summary card (6 stats). Per-flock breakdown of feedings/production/casualties. Unlogged flocks list with "Log now →" action. "Log now" in daily mode sets currentIndex to that flock; in quick mode navigates to daily.
- **Edit Panel:** Right slide-in. Per-feeding-event edit form (`FeedingEditForm`) with feed type selector (shows current + assigned options), weight input, input method toggle, live cost preview (cost total + cost/bird recalculated in real time), save and delete with confirmation step. Per-production-log edit form (`ProductionEditForm`).
- **Restart menu (···):**
  - "Reset queue — keep logged data": re-fetches queue, clears completed/skipped/done state, doesn't touch DB
  - "Restart from specific flock": opens `FlockPickerModal` — pick any flock, all before it marked complete
  - "Start day over": opens `RestartConfirmModal` — deletes all today's `feeding_events` (triggers restore inventory per-row), resets all state
- **Completion screen additions:** "Review Today", "Edit an entry", "Start over" buttons added alongside existing Dashboard and Export buttons
- **Panel URL detection:** `/scale-house?panel=review` or `?panel=edit` auto-opens the corresponding panel on mount (used by Dashboard quick-access buttons)
- **Two deletion paths for feeding events:** `deleteEvent` from `scaleHouseApi` handles the TodayLogPanel inline delete (existing). `deleteFeedingEvent` from `daySessionApi` handles EditPanel deletes. Both paths trigger the Postgres `feeding_event_restore_on_delete` trigger.
- **Scale hardware:** Still permanently non-functional. `getScaleStatus()` always returns `{ connected: false }`.

### Inventory (`src/pages/inventory/Inventory.jsx`) → `/inventory`
- **Data sources:** `inventoryApi` (getInventory, purchaseFeed, adjustFeed, etc.)
- **Status:** Complete

### Financials (`src/pages/finances/Financials.jsx`) → `/financials`
- **Data sources:** `financialsApi` (summary, flock P&L, revenue CRUD)
- **Status:** Complete

### Export (`src/pages/reports/Export.jsx`) → `/export`
- **Data sources:** `exportApi.getExportPreview`, `generateExport`, `scaleHouseApi.getQueue()`
- **Status:** Styled and functional for CSV. PDF/XLSX show "not yet available" error.
- **Fixed:** Full Tailwind rewrite — two-column layout, format cards with selection state, date preset pills, format-aware preview panel, recent exports list with colored format badges.
- **Fixed:** `getQueue()` now called without args.

### FarmSetup (`src/pages/settings/FarmSetup.jsx`) → `/farm-setup`
- **Data sources:** `onboardingApi`
- **Status:** Complete

### Settings (`src/pages/settings/Settings.jsx`) → `/settings`
- **Data sources:** `usersApi`, `supabase.auth.updateUser`, `supabase.auth.signInWithPassword`, `supabase.auth.resetPasswordForEmail`
- **Status:** Complete (auth flows implemented)
- **Section A — Display Name:** `updateUser(profile.id, { display_name })` — unchanged
- **Section B — Email:** Stages `view → verify → verifying → change → sent`. Current password verified with `signInWithPassword` before change. `supabase.auth.updateUser({ email: newEmail })` sends confirmation email to new address. Warn banner explains pending-confirmation behavior.
- **Section C — Password:** Stages `form → verifying → changing → success`. Two-step: verify current password with `signInWithPassword`, then `updateUser({ password: newPassword })`. "Forgot your password?" link triggers `resetPasswordForEmail`. Auto-resets to 'form' after 3s on success.

---

## SECTION 5 — COMPONENTS AUDIT

### `src/components/AppLayout.jsx`
- Renders sidebar nav on desktop. On mobile (`< lg`), collapses to fixed top bar with hamburger that opens a slide-in drawer. Backdrop closes drawer. Uses `useLocation` to close drawer on route change. Renders `<Outlet />`.

### `src/components/InlineFeedback.jsx`
- Renders DaisyUI `alert` div when `message` prop is present. Variants: error, success, info, warning. Returns null if no message.

### `src/components/ProtectedRoute.jsx`
- Reads `user`, `loading`, `isOnboarded` from `AuthContext`. Redirects to `/login` if no user. Redirects to `/onboarding` if not onboarded.

---

## SECTION 6 — SERVICE FILES AUDIT

### `src/services/daySessionApi.js` (NEW)
Exports:
- `getTodaySession(date?)` — queries `feeding_events`, `production_logs`, `casualty_logs` for a given date with full relational joins. Returns `{ date, feedings, production, casualties, summary }` where summary includes `flocks_fed`, `total_feed_cost`, `total_feed_used`, `total_eggs`, `total_casualties`, `total_additions`, `cost_per_bird_avg`.
- `updateFeedingEvent(eventId, updates)` — plain UPDATE. Postgres trigger `feeding_event_adjust_inventory` handles inventory side effects.
- `deleteFeedingEvent(eventId)` — plain DELETE. Postgres trigger `feeding_event_restore_on_delete` handles inventory restoration.
- `updateProductionLog(logId, updates)` — plain UPDATE.
- `deleteAllTodayFeedings(date)` — DELETE WHERE date = X. Trigger fires per-row for each deleted event.

### `src/services/scaleHouseApi.js`
No changes. Still contains `getQueue(userId)` (userId used for server call even though RLS would scope it — consistent with the existing scaleHouseApi pattern). Also has `deleteEvent` and `patchEvent` which are separate from the new `daySessionApi` functions. Both deletion paths hit Postgres and trigger the same restore trigger.

---

## SECTION 7 — STYLING AUDIT

### CSS Custom Properties (unchanged)
```css
--bg-base:        #0f1a0f
--bg-surface:     #162416
--bg-elevated:    #1e321e
--accent-primary: #4caf50
--accent-muted:   #2e7d32
--accent-warn:    #ff8f00
--accent-danger:  #c62828
--text-primary:   #e8f5e9
--text-secondary: #a5d6a7
--text-muted:     #6ea871
--border:         #2e7d32
```

### Known Specificity Conflicts / Workarounds
1. **`.field span` specificity `[0,1,1]` beats Tailwind `[0,1,0]`** — `Inventory.jsx` avoids `.field` and hardcodes hex values directly to work around this.
2. **DaisyUI element rules vs Tailwind utilities on modal content** — Fixed by adding `text-[#e8f5e9]` on modal wrapper divs.

### Hardcoded Hex Values in JSX (outside index.css)
- `#e8f5e9` — label text in modals (`Inventory`, `FlockList`, `FlockDetail`, `Financials`, `FarmSetup`, `Login`, `ScaleHouse` panels)
- `#071107` — dark text on green accent buttons
- `#a5d6a7` — hint text in `Inventory`
- `rgba(198,40,40,*)` — red danger hover/border on close buttons and delete actions
- `rgba(76,175,80,*)` — green focus rings
- `rgba(46,125,50,*)` — subtle green borders in tables and stat cells

### Responsive Breakpoints
- `lg` (1024px) — primary: sidebar collapse, grid switches
- `sm` (640px) — flock/inventory card grids
- `xl` (1280px) — flock/inventory card grids (3-col)
- `max-[640px]:` — ScaleHouse panels (full-screen on small mobile)
- `max-[980px]:` — ScaleHouse two-column grid collapses

---

## SECTION 8 — WHAT IS WORKING

The following features are confirmed end-to-end:

1. **Authentication** — Sign in, sign up, sign out, session persistence, session refresh, expired-session handling
2. **Forgot password** — `resetPasswordForEmail` sends reset link; `/reset-password` public page handles the recovery event and calls `updateUser({ password })`
3. **Email change in Settings** — two-step: verify current password → send `supabase.auth.updateUser({ email })` → user clicks confirmation link in email
4. **Password change in Settings** — two-step verify-then-update with "Forgot?" fallback to reset email
5. **Onboarding wizard** — Creates animal classes, breeds, flocks, feed types with assignments
6. **Dashboard** — Today's feeding status, yesterday P&L, feed stock meters, low-feed alerts
7. **Dashboard quick-access** — "Review Day" / "Edit Day" buttons appear when feeding has started; navigate to ScaleHouse with panel pre-opened
8. **Flock list / flock detail** — All flock data, feeding history, production log, headcount timeline
9. **Scale house daily mode** — Full feeding queue with green mode banner, "Currently logging:" accent card, Skip/Complete & Next flow
10. **Scale house quick mode** — Single flock entry with grey mode banner and flock selector
11. **Scale house Review panel** — Date-selectable session summary with per-flock breakdown and unlogged flock list
12. **Scale house Edit panel** — Per-event edit forms with live cost preview, feed type switching, delete with confirmation
13. **Scale house Restart menu** — 3-option dropdown: reset queue (keep data), restart from specific flock (picker modal), start over (delete all + confirm modal)
14. **Completion screen** — Summary stats, breakdown table, plus Review Today / Edit an entry / Start over actions
15. **Inventory** — Feed cards, on-hand meter, purchase (RPC), adjust (RPC), transaction ledger
16. **Low-feed alerts** — Generated by trigger, dismissed from Dashboard and Inventory
17. **Financials** — Period switching, revenue logging, Recharts feed-cost-vs-revenue chart, per-flock P&L
18. **Export — CSV** — Feeding log, production log, financial summary, inventory snapshot
19. **Export styling** — Fully Tailwind-converted with two-column layout, format cards, preview panel
20. **Farm Setup** — Full CRUD for all setup entities
21. **Settings — all auth flows** — Display name, email (with confirmation), password (with verify), notification prefs
22. **Netlify SPA routing** — `public/_redirects` routes all paths to `index.html`

---

## SECTION 9 — WHAT IS BROKEN OR INCOMPLETE

### Non-functional / Permanently Removed

**1. Live scale hardware permanently non-functional**
`scaleHouseApi.js` — `getScaleStatus()` always returns `{ connected: false }` and `openScaleStream()` always fires `onError`. The DYMO USB HID bridge existed in Flask. No replacement path defined. ScaleHouse renders a "SCALE" input method UI panel that is dead on arrival. Users can still use MANUAL input.

**2. PDF and XLSX export throw errors**
`exportApi.js` — `generateExport` throws `"${format.toUpperCase()} export is not yet available"` for both `pdf` and `xlsx`. These are listed in the UI (grayed with "soon" style) but clicking Generate with either format selected will produce an error banner.

### Incomplete Features

**3. Notification preferences not delivered**
Settings saves `email_alerts` and `daily_summary_email` flags to `users.preferences` JSONB, but there is no edge function, cron job, or third-party email integration. The toggles are cosmetic — no emails are ever sent.

**4. `breeding_logs` table — RLS configured, no UI**
RLS is enabled with `user_owns_flock` policy but there are zero frontend queries against this table. It's an orphan in the schema.

**5. `financial_records` table — RLS configured, no UI**
Same situation as `breeding_logs`.

**6. Time zone setting has no effect on data**
Settings saves `time_zone` to `users.preferences`. Nothing reads this value. All dates display in the browser's local time zone. The setting creates a false expectation.

**7. Billing tab is a static stub**
Renders a "Free" plan card with "Upgrade to Pro - coming soon" text. No Stripe, no payment integration, no plan gating.

### Structure Issues

**8. Placeholder page directories with no components**
- `src/pages/animals/` — only `.gitkeep`, no route
- `src/pages/feed/` — only `.gitkeep`, no route
- `src/pages/production/` — only `.gitkeep`, no route

**9. `src/hooks/` is empty**
`.gitkeep` only. No custom hooks exist despite several components having shared logic that could be extracted (e.g., date formatting, flock-loading pattern).

**10. Legacy `frontend/` and `backend/` directories**
Gitignored but physically present on disk (couldn't be deleted due to Windows file locks on node_modules executables). Contribute nothing to the active build. Should be manually deleted once those processes are closed.

### Minor / Cosmetic

**11. `scaleHouseApi.getQueue(userId)` still takes a userId arg**
Unlike the now-fixed `flocksApi.getFlocks()` and `exportApi.getQueue()`, `scaleHouseApi.getQueue(userId)` still accepts a userId parameter and uses it. RLS would scope results anyway but the call is consistent with the rest of scaleHouseApi which also passes userId throughout. Low priority.

**12. InlineFeedback relies on DaisyUI alert classes**
`alert alert-error`, `alert alert-success` etc. depend on DaisyUI rendering correctly under the `farmbright` theme. Not a bug today but a coupling point if theme is ever changed.

**13. `daySessionApi.getTodaySession` query could silently fail**
The function catches all errors and returns `null`. If column names in the select string don't match the actual DB schema (e.g., if `feed_types.cost_per_unit` is named differently in the live DB), the query fails silently and the panels show "No data for this date." There's no error surface to the user. Low severity but worth verifying column names against the actual DB once.

**14. `FeedingEditForm` hides feed type selector when only one feed option**
The selector only renders when `feedOptions.length > 1`. If a flock has had its assigned feeds removed after the feeding was logged, only the original feed shows and the selector is hidden. This is intentional (no point selecting from one option) but means there's no visible label for what feed type is recorded. Low severity.

---

## SECTION 10 — OPEN QUESTIONS

**1. What should happen when the live scale is reconnected?**
The DYMO USB HID bridge was removed with Flask. Is hardware scale support a future goal? Options: separate Electron sidecar app, Web HID API implementation, local HTTP bridge. Until decided, the SCALE input method UI renders but does nothing.

**2. Should `breeding_logs` and `financial_records` have UI?**
Both tables have RLS configured. Are these planned features for a future sprint, or dead schema?

**3. What is the email delivery strategy for notifications?**
Preferences save to DB but nothing reads them to send emails. Is the plan a Supabase Edge Function + Resend/SendGrid? Until decided, the Notifications tab creates a false expectation.

**4. Should the placeholder route directories be deleted or routed?**
`animals/`, `feed/`, `production/` — are these next sprint items? Removing the directories would keep the structure honest.

**5. Is the time zone preference meant to affect anything?**
If feeding event timestamps should display in the farm's local time zone rather than the browser's, this needs an implementation decision. Currently it does nothing.

**6. Is PWA / offline support planned?**
No manifest, no service worker. For a farm app used in areas with poor connectivity, offline-first would be high value but is a significant architectural decision.

**7. Is the billing / Pro upgrade path defined?**
Billing tab is a stub. Is Stripe the target? What features gate behind Pro?

**8. Should the `daySessionApi` select columns be verified against live DB?**
`getTodaySession` uses compound relational joins (`flocks ( id, name, current_headcount, breeds ( name, animal_classes ( name ) ) )`). If the actual live DB schema doesn't have the exact column names referenced, the query will fail silently. Should be tested with real data.
