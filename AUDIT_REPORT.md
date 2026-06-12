# Flock — Code Audit Report

Date: 2026-06-12
Files analyzed: 43 (40 source files in `farmbright/src/`, plus `index.css`, `tailwind.config.js`, `package.json`)
Total issues found: 78

## Executive Summary

Flock is a well-organized React 19 + Supabase app with a clean service-layer separation, a smart animal-class abstraction (`utils/animalClass.js` + `useAnimalClass`), and a consistent canonical join path (`breeds → animal_types → animal_classes`) across every service. The dark-green design language is cohesive and CSS variables are used widely. The biggest problems are: (1) several **functional bugs** — `individual_tracking_enabled` is never selected by any flock query so the entire Animals feature is unreachable, the FlockDetail breed path renders blank, and a dead "Log litter" button; (2) a **timezone split** — Scale House uses local dates while every other service uses UTC (`toISOString`), so evening entries land on different "days" across the app; (3) **three competing component systems** (custom CSS classes, DaisyUI, raw Tailwind) used interchangeably for buttons, modals, and forms; and (4) **silent error swallowing** in roughly a dozen mutation paths. Mobile fundamentals are mostly solid (drawer nav, fixed action bar, collapsing grids), but the Review/Edit side panels stack *under* the mobile top bar, and the spec'd `MobileBottomNav` component does not exist at all.

---

## Priority Issues (fix immediately)

### 1. `individual_tracking_enabled` is never fetched — the Animals feature is permanently disabled
File: `farmbright/src/services/flocksApi.js:117` (getFlockDetail select), `farmbright/src/services/scaleHouseApi.js:30` (getQueue select)
Severity: HIGH
Description: `FlockDetail.jsx:89,482`, `ScaleHouse.jsx:295`, and the EditPanel (`ScaleHouse.jsx:1086`) all branch on `flock.individual_tracking_enabled`, but neither `getFlockDetail()` nor `getQueue()` selects that column. The value is always `undefined`, so: the Animals tab always shows "tracking not enabled" — even immediately after the user clicks "Enable Individual Tracking" (the update succeeds in the DB, then `refresh()` re-fetches without the column) — and Scale House / Edit Day never load per-animal lists for observation tagging.
Fix: Add `individual_tracking_enabled` to the flock select lists in `getFlockDetail` and `getQueue` (and map it through in the returned objects).

### 2. Timezone inconsistency: Scale House uses local dates, everything else uses UTC
Files: `scaleHouseApi.js:7`, `daySessionApi.js:3`, `ScaleHouse.jsx:39` (local) vs. `dashboardApi.js:15`, `flocksApi.js:13`, `financialsApi.js`, `observationsApi.js:44`, `exportApi.js`, `ObservationEntry.jsx:77`, `AnimalDrawer.jsx:6`, `FlockDetail.jsx:17`, `Inventory.jsx:15`, `Financials.jsx:13`, `FarmLog.jsx:9`, `Export.jsx:9` (all `new Date().toISOString().slice(0,10)` = UTC)
Severity: HIGH
Description: For any user west of UTC, after ~5–8 PM local time `toISOString()` returns *tomorrow's* date. A feeding logged in Scale House at 8 PM (local date) will not appear in the Dashboard's "today" (UTC date), observations get stamped with tomorrow's date, "fed today" badges disagree between pages, and `getFlocks().today_fed` disagrees with `getQueue().fed_today`. The recent commit fixed Scale House only.
Fix: Extract one shared `getLocalDateString()` into `src/utils/date.js` and replace every `toISOString().slice(0,10)` used as a calendar date.

### 3. FlockDetail header breed path renders blank
File: `farmbright/src/pages/flocks/FlockDetail.jsx:176`
Severity: HIGH
Description: The header renders `{flock.breeds?.name} · {flock.breeds?.animal_types?.name} · {flock.breeds?.animal_types?.animal_classes?.name}`, but `getFlockDetail()` returns a *flattened* flock object (`breed_name`, `animal_class_name`) with no nested `breeds` key. The line renders as " · · ".
Fix: Use `flock.breed_name` / `flock.animal_class_name`, or return the nested `breeds` object from the service.

### 4. "Log litter" link in the Litter History panel does nothing
File: `farmbright/src/pages/flocks/FlockDetail.jsx:281`
Severity: HIGH
Description: The button calls `setModal("litter")`, but no render branch exists for `modal === "litter"` — `LitterModal` only renders when `showLitterModal` is true (set by the header button at line 198). The panel's "Log litter" link is dead.
Fix: Change the handler to `setShowLitterModal(true)`.

### 5. Review/Edit Day panels render under the mobile top bar
File: `farmbright/src/pages/scale-house/ScaleHouse.jsx:899-900, 1211-1212` vs. `farmbright/src/components/AppLayout.jsx:93`
Severity: HIGH
Description: The Review and Edit panels use backdrop `z-40` / panel `z-50`, while the fixed mobile top bar is `z-[60]`. On phones the panel goes `inset-y-0`, so its header (including the Close button) sits behind the top bar, and the hamburger menu stays clickable over the open panel. The Scale House Edit Day panel is a primary mobile workflow.
Fix: Raise the panels to `z-[70]`/`z-[80]` (matching `AnimalDrawer`), or standardize a z-scale (see Z-Index section).

### 6. Today's Log delete button is unreachable on touch devices
File: `farmbright/src/pages/scale-house/ScaleHouse.jsx:2447`
Severity: HIGH
Description: The per-event delete button is `opacity-0 group-hover:opacity-100`. There is no hover on touch screens, so on the primary field device the button is invisible and effectively non-functional (it occupies space but can't be discovered).
Fix: Make the button always visible at reduced opacity on small screens (e.g. `opacity-60 lg:opacity-0 lg:group-hover:opacity-100`) and enlarge to ≥40px.

### 7. Re-running Onboarding Step 1 creates duplicate animal classes
File: `farmbright/src/pages/onboarding/OnboardingWizard.jsx:104-143`
Severity: HIGH
Description: `saveStep2`/`saveStep3`/`saveFeedSetup` skip rows that already have an `id`, but `saveStep1` unconditionally inserts new `animal_classes` and `animal_types` every time it runs. Going Back to step 1 and pressing Next again duplicates the entire class/type hierarchy.
Fix: Track saved classes/types like the other steps (skip inserts when `id` exists, or diff against `selectedSpecies`).

### 8. FarmLog edit dialog: custom `.modal-backdrop` CSS conflicts with DaisyUI's modal
File: `farmbright/src/pages/log/FarmLog.jsx:353-368` and `farmbright/src/index.css:224`
Severity: HIGH
Description: The edit dialog uses DaisyUI's `<dialog class="modal">` pattern with `<div class="modal-backdrop">`. But `index.css` globally defines `.modal-backdrop` as `position: fixed; inset: 0; z-index: 1000; background: rgba(...)`. Inside the dialog this backdrop paints *above* the `.modal-box` (which has no z-index), darkening and likely click-blocking the Edit Observation form.
Fix: Rename the custom class (e.g. `.app-modal-backdrop`) or stop using DaisyUI's `modal-backdrop` class name in FarmLog. Verify the dialog is interactive after the change.

### 9. Inventory mutations have no error handling — silent unhandled rejections
File: `farmbright/src/pages/inventory/Inventory.jsx:62-110`
Severity: HIGH
Description: `loadTransactions`, `saveEdit`, `dismissAlert`, `submitPurchase`, and `submitAdjustment` await service calls with no try/catch. If `purchase_feed`/`adjust_feed` RPC fails (validation, RLS, network), the promise rejects unhandled: the modal stays open, no message is shown, and the user cannot tell whether the purchase was recorded.
Fix: Wrap each in try/catch and surface `setError(...)` (the page already has an error banner).

### 10. `getFlocks()` downloads every feeding event ever recorded
File: `farmbright/src/services/flocksApi.js:27-29`
Severity: HIGH
Description: The Flocks list fetches the entire `feeding_events` table (`flock_id, date, timestamp, total_weight, cost_per_lb_at_time` with no date filter or limit) on every visit just to compute `last_fed`, `today_fed`, and all-time cost in JS. With a year of daily multi-flock data this is thousands of rows per page load, growing unbounded. `AppLayout` compounds this by calling the similarly heavy `getQueue()` every 60 seconds for a badge count.
Fix: Compute aggregates server-side (a Postgres view/RPC like `flock_stats`), or at minimum select only today's events for `today_fed` and use `order/limit` for `last_fed`. Give AppLayout a lightweight count query.

---

## Design Pattern Issues (Section 1)

### 1.1 CSS variable usage

1. **`font-mono` does not actually map to IBM Plex Mono** — `tailwind.config.js` has `theme.extend: {}`, so Tailwind's `font-mono` utility resolves to the default system mono stack (ui-monospace/SFMono/Menlo), not IBM Plex Mono. The hundreds of `font-mono` usages render a *different* font than the body (which gets IBM Plex Mono from `index.css`). Likewise there is no `font-display` utility; code uses the custom `.display-font` class. **Fix:** extend `fontFamily: { mono: ['"IBM Plex Mono"', 'monospace'], display: ['"DM Serif Display"', 'serif'], number: ['"JetBrains Mono"', 'monospace'] }` and migrate.
2. Hardcoded hex that should be CSS vars (recurring):
   - `text-[#e8f5e9]` (= `--text-primary`) in `Inventory.jsx:423,650,656,658`, `FlockList.jsx:224`, `FlockDetail.jsx:866`, `Financials.jsx:309`, `FarmSetup.jsx:269,450,471` + label spans, `ResetPassword.jsx:95,112`.
   - `text-[#a5d6a7]` (= `--text-secondary`) in `Inventory.jsx:424`; recharts axes `stroke="#a5d6a7"` in `Financials.jsx:166-167,182-183`.
   - `text-[#071107]` (on-accent text) hardcoded in ~15 places (`AppLayout.jsx:158`, `FlockList.jsx:256`, `OnboardingWizard.jsx:297`, `ScaleHouse.jsx:2036`, `CustomSpeciesForm.jsx:99`, `Financials.jsx:117,260` …). Should be a `--text-on-accent` variable.
   - `#ef9a9a`/`#ffcdd2` danger-hover tones in `ScaleHouse.jsx:1461,2447`, `index.css:175-181` — fine in CSS, but the inline Tailwind copies should reference a var.
   - Designation colors `#42a5f5/#90caf9/#ab47bc/#ce93d8/#ffcc80` duplicated inline in `Financials.jsx:222-224` and `ScaleHouse.jsx:1849-1851` when `.designation-badge.{layer,breeder,meat,mixed}` already exists in `index.css:134-137` (and ScaleHouse's meat color `#ffcc80` disagrees with the CSS version `var(--accent-warn)`).
   - `Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }}` in `Financials.jsx:168,184` — use vars.
   - `exportService.js:7-12` theme constants duplicate the palette as RGB tuples (acceptable for PDF, but worth a comment linking to `index.css`).
3. Inline `style={{}}` that should be Tailwind/CSS: grid templates in `AppLayout.jsx:90`, `Dashboard.jsx:178,308`, `FlockList.jsx:112,133`, `Inventory.jsx:185,198,329`; `style={{ gap: "2rem" }}` in `AppLayout.jsx:123`; `style={{ padding: "14px 18px" }}` repeated 5× in `FlockDetail.jsx:232-368`; `style={{ fontFamily: "IBM Plex Mono, monospace" }}` in `FlockDetail.jsx:659`, `Inventory.jsx:157,270,307`, `Financials.jsx:160,176` — three different idioms exist for the same font (`font-mono` class, inline style, and `font-[IBM_Plex_Mono,monospace]` arbitrary value in ScaleHouse). Pick one (the Tailwind utility, after fixing 1.1.1).
4. DaisyUI theme vs CSS vars duplication: `tailwind.config.js` re-declares the same palette (`base-100` = `--bg-base`, `primary` = `--accent-primary` …). Code mixes `bg-base-200` (AppLayout) with `bg-[var(--bg-surface)]` (everywhere else) for the same color. Not wrong, but two names for every color invites drift.

### 1.2 Component patterns

5. **Four modal systems coexist**: (a) `.modal-backdrop`/`.modal-card` CSS (FlockList, FlockDetail, Inventory, Financials, FarmSetup) at z-1000; (b) DaisyUI `<dialog class="modal">` (FarmLog) — broken, see Priority #8; (c) right-side panels at z-40/50 (ScaleHouse Review/Edit) and z-70/80 (AnimalDrawer); (d) centered overlays at z-50/60 (FlockPickerModal, RestartConfirmModal). Backdrop opacity also varies (0.72 / 0.60 / 0.58).
6. **Close-button sizes vary wildly**: 48px `h-12 w-12` with `X size={28}` (FlockList:224, FlockDetail:866, Inventory:658, Financials:309), 40px (AnimalDrawer:130), `btn-circle btn-sm` ≈32px (ScaleHouse panels:906,1226), 28px `h-7 w-7` (FlockPickerModal:1578), and `icon-button` (FarmSetup FeedAssignModal:768). Standardize one `ModalClose` pattern (44px+).
7. **Three button systems**: custom `.primary-button`/`.secondary-button`/`.icon-button` (index.css), DaisyUI `btn btn-sm/btn-xs/btn-ghost`, and hand-rolled `inline-flex items-center …` Tailwind buttons (Inventory footer, Dashboard dismiss, ScaleHouse pills). Danger styling alone has 3 implementations (`.icon-button.danger`, `bg-[var(--accent-danger)] text-white`, `bg-[rgba(198,40,40,0.2)] border …`). Recommend: keep the CSS classes as the canonical variants and stop introducing `btn` for new code (or the reverse), then migrate opportunistically.
8. **Form fields**: `.field` (index.css) vs DaisyUI `form-control`/`label-text` (ResetPassword, FarmSetup feed form) vs bespoke `grid gap-[7px] text-xs` labels (Login) vs Inventory's own `FormField` component. Four label/input styles for identical inputs.
9. **Loading states**: text-only "Loading X..." panels (Dashboard:113, FlockList:70, FlockDetail:162, Inventory:112, Financials:102, FarmSetup:257, ScaleHouse:490) vs animated spinners (`.route-loading`, ResetPassword, ScaleHouse panels, Settings buttons). Make a small `<LoadingPanel/>` with the spinner.
10. **Empty states**: FlockList has the full icon+message+CTA pattern (line 73-79); Inventory ("No feed types configured yet." plain panel:223), FarmLog (text only), FlockDetail tables (one-line text), Export ("No preview data available."). Standardize on the FlockList pattern.

### 1.3 Typography

11. Page titles range across `text-3xl` (FarmLog:123, Export:114), `.page-header h1` 32px (Dashboard, FlockList, Inventory, Settings, FarmSetup), `text-[32px]` (Financials:109, ScaleHouse entry header:1840), `text-3xl lg:text-4xl` (FlockDetail:174), and 40px on the completion screen (ScaleHouse:511) and Login (79). Pick one (`text-[32px]`/h1) and apply.
12. Section headers mix `display-font` at 20/22/24/28px (`ScaleHouse:2404`, FarmSetup:450 vs 471, FlockDetail panels) with uppercase 13px mono headers (`ScaleSection`, Financials chart titles, Export panel titles). Two intentional tiers is fine — but FarmSetup uses 22px and 28px display headers for sibling panels (450 vs 471).
13. `eyebrow` class exists for kickers, but FarmLog/Export/Financials also hand-roll `font-mono text-xs uppercase tracking-wider` kickers. Reuse `.eyebrow`.
14. Stat values: `number-font text-[32px]` (FlockList:114, FlockDetail StatCard:649) vs `text-[22px] lg:text-[36px]` (Dashboard cards, Financials KPI) vs `text-lg` (Review panel summary). Acceptable per context, but Dashboard and Financials should share one `Kpi` component (they're near-identical).

### 1.4 Spacing

15. Card padding values in use: `p-2.5, p-3, p-3.5, p-4, p-5, p-[14px], p-[18px], p-6, p-8, p-10`, plus `.panel-card` 20px and `.modal-card` 18px. Recommend collapsing to p-3 / p-4 / p-5 (12/16/20).
16. Section gaps: `gap-3, gap-3.5, gap-4, gap-[10px], gap-[14px], gap-[18px], gap-5` are all used as "card grid gap". Pages alternate between `grid gap-4` (Dashboard, Inventory, Financials, FarmLog) and `grid gap-[18px]` (FlockList, FlockDetail, OnboardingWizard). Pick `gap-4` (or 18px) and standardize page roots.
17. `Export.jsx:111` wraps the page in `min-h-screen bg-[var(--bg-base)] p-6` although `AppLayout` already provides `p-6` + background — Export gets double padding and is the only page styled this way.

---

## UI Issues (Section 2)

### 2.1 Accessibility

18. **Touch targets below 44px** (HIGH for field use): ObservationCard edit/delete `btn-xs p-1` with 12px icons (~24px) (`ObservationCard.jsx:81,90`); FarmLog row edit/delete (332-339); Dashboard alert dismiss 30px (141); Inventory alert dismiss 28px (138); FlockPicker close 28px (ScaleHouse:1578); FarmSetup `accordion-toggle` padding 4px (index.css:308); `text-link-button` bare 12px text (index.css:184).
19. **Unlabeled inputs**: ScaleHouse manual weight input (2076) and water input (2137) have no `<label>` text or `aria-label` (visually implied by section header only); same for EditPanel weight/water (1306,1335). Egg +/- buttons have no `aria-label` ("-"/"+" only) (2164-2178). MEDIUM.
20. **Color-only state**: feed status dots (Dashboard:313, Inventory:171) do pair with text — good; but FlockList "Fed today" dot+text OK, while DailyProgress chips rely on icon+color only for skipped vs pending — icons differ (`CircleArrowDown` vs `Circle`) so acceptable. Inventory transaction-type badges and severity badges include text — OK. Net: LOW; main gap is the StockMeter par marker (Inventory:250) which is a color/position-only signal with an 11px label that can overflow the bar edges when par is near 0% or 100%.
21. **Contrast**: `--text-muted` (#6ea871) on `--bg-surface` (#162416) ≈ 5.5:1 — passes AA for normal text, but it is frequently used at 10–11px where the comfortable floor is higher. The warn badge `text-[#071107]` on `bg-warning` is fine. `--accent-danger` (#c62828) used as *text* on dark backgrounds (`negative` class, Financials net P&L) is ≈4.0:1 — borderline at 12px; consider the lighter `#ef9a9a` already used elsewhere. MEDIUM.
22. Backdrops (`onClick={onClose}`) have no keyboard escape handling and modals don't trap focus (all modal implementations). LOW-MEDIUM.

### 2.2 Overflow and clipping

23. Tables with proper scroll wrappers: Financials (195), FlockDetail DataTable (658), FlockDetail animals (554), OnboardingWizard feed matrix (627), ScaleHouse completion (521) and TodayLogPanel (2411) — good. **Missing min-width**: AnimalDrawer weight table (239) and FarmLog have none, but their column counts are small — LOW.
24. `DailyModeBanner` row (`ScaleHouse.jsx:760`) has `flex justify-between` with **no wrap**: title + step counter + 3 buttons overflow at ~360px width. MEDIUM.
25. Dashboard stat values use `break-all` (246,256,266) — currency like "$1,234.56" can break mid-number ("$1,2\n34.56"). Use `break-words` or `[overflow-wrap:anywhere]` like SummaryTile. LOW.
26. Onboarding sidebar: at ≤980px the grid stacks and the `aside` keeps `min-h-screen` (OnboardingWizard.jsx:268) — users must scroll past a full screen of sidebar before the step content. MEDIUM.

### 2.3 Z-index conflicts

27. Current scale is ad hoc: `.modal-backdrop` 1000 (CSS), AnimalDrawer 70/80, mobile top bar + sidebar 60, drawer backdrop 55, FlockPicker/Restart 50/60, Review/Edit panels 40/50, daily bottom bar 5, Financials FAB 8, sticky table headers 1-10. Issues: Review/Edit under top bar (Priority #5); FlockPicker modal content ties the top bar at 60 (wins only by DOM order); restart dropdown menu z-[60] inside banner could collide with the top bar on mobile. Define tokens (e.g. nav 40, panel 50, modal 60, toast 70) and migrate. MEDIUM.
28. FarmLog DaisyUI dialog vs custom `.modal-backdrop` CSS — see Priority #8.

### 2.4 Loading states

29. Inventory `loadTransactions` (62) shows nothing while fetching history — the card just doesn't expand for a beat. LOW.
30. Dashboard observations/follow-ups load after the overview with no placeholder — sections pop in below the fold (layout shift). LOW.
31. Financials period switch dims content (`opacity-60 pointer-events-none`) — good pattern; consider reusing it in FarmLog (which blanks the list to "Loading..." on every filter change).

### 2.5 Error handling

32. **Silent catches (console-less, user-less)** — MEDIUM-HIGH cluster:
    - `AnimalDrawer.jsx:35,56,70` — load/logWeight/status change marked `// silent`.
    - `FlockDetail.jsx:85,90,131,147` — observation/animal loads, enable-tracking, save-animal.
    - `Dashboard.jsx:69-70` — observation loads; `handleDismissAlert`/`handleResolveObs` (102-111) have no catch → unhandled rejection.
    - `FarmLog.jsx:79` — history load failure silently shows an empty log (user can't distinguish "no data" from "error"); `handleResolve`/`handleDeleteObs` (93-102) no catch.
    - `BreedSelector.jsx:34` — group load `.catch(() => {})`.
    - `Financials.jsx:96-100` — `submitRevenue` no try/catch (modal closes only on success, but failure is invisible).
    - `ScaleHouse.jsx:416-420` — `handleDeleteEvent` no catch; EditPanel observation load (1084) silent.
    - Inventory — Priority #9.
33. `observationsApi.logObservation:30` — the `animal_health_logs` insert result is ignored; a failure silently loses the health record. Similarly `deleteObservation:130` ignores the health-log delete error. MEDIUM.
34. Leftover axios error shapes: `error.response?.data?.message` checked in `Dashboard.jsx:55`, `Inventory.jsx:54`, `Financials.jsx:61`, `ScaleHouse.jsx:254`, `FlockList.jsx:308`, `OnboardingWizard.jsx:52`, `FarmSetup.jsx:935` — Supabase errors never have `.response`, so these always fall to the generic message and hide the real cause. Use `error.message` first. MEDIUM.
35. `logSession` (`scaleHouseApi.js:147`) performs casualty → feeding → production as separate inserts with no transaction; a mid-sequence failure leaves partial data (casualty recorded, feeding not). Consider an RPC like `purchase_feed`. MEDIUM.

### 2.6 Dead code

36. `ScaleHouse.jsx:50-82` — `animalIcons` + `flockIcon()` never used. Also `updateObservation` imported (line 20) but unused.
37. `FarmLog.jsx:6` — `updateObservation` imported unused; `handleResolve` (93) defined but no resolve button exists in the page (follow-ups can only be resolved from Dashboard/FlockDetail); `resolvedIds` state therefore only ever filters nothing.
38. `Dashboard.jsx:46` — `resolvedObsIds` is written but never read. `statusIcon`'s "skipped" branch (34) can never trigger (API never returns that status). `overview?.farm_name` (120) is never returned by `getDashboardOverview` — the header always says "Dashboard".
39. `Inventory.jsx:277-313` — `EditableStat` component entirely unused (superseded by `EditableBagStat`).
40. `flocksApi.js:227-281` — `getFeedingHistory` and `getProductionHistory` are exported but never imported anywhere ("View all" buttons navigate to Scale House instead).
41. `scaleHouseApi.js:313-327` — `patchEvent` never used (EditPanel uses `daySessionApi.updateFeedingEvent`).
42. `exportApi.js:27-49` — `generateExport` never used (Export.jsx switched to `exportService`); the PDF/XLSX "not yet available" error is dead messaging since both now exist. `exportService.js:16-34` — `fetchFlocks` defined but never called.
43. `Export.jsx:132-144` — `card.deferred` branches are dead (no card sets `deferred`).
44. `package.json` — `react-datepicker` is a dependency but is never imported anywhere. Remove it.
45. `FlockList.jsx:149` — `flock.total_young_alltime` is rendered but `getFlocks()` never computes it → always "—". Either compute it or drop the cell. Adjacent: working-animal flocks render two identical cost StatCells (144 + 152).
46. `BreedSelector.jsx:107` — `getClassConfig(group.class_type)?.emoji` always yields `undefined` (CLASS_CONFIG entries have no `emoji` key); the fallback paw always wins for multi-type classes. Use `classTypeEmoji()` from SPECIES_MAP like CustomSpeciesForm does.
47. Console statements: only `Export.jsx:103` (`console.error`) — acceptable but inconsistent with the rest of the app. No TODO/FIXME comments found. No commented-out blocks found.

---

## Responsiveness Issues (Section 3)

48. **`MobileBottomNav.jsx` does not exist.** The audit spec and app conventions reference it, but no such component is in the tree; mobile navigation is solely the hamburger drawer in `AppLayout`. If a bottom nav is planned, none of the pages' `pb-16/pb-20` math accounts for it yet. (The current `pb-20` paddings clear the ScaleHouse fixed bottom bar and the Financials FAB — those are fine.) Severity: informational/HIGH depending on intent.
49. **Navigation (3.2)**: Sidebar correctly hides off-canvas (`-translate-x-full`) and the drawer/backdrop/hamburger work; drawer closes on route change (AppLayout:45). `pt-20` clears the fixed top bar. ✓ No issues beyond the z-index collision in Priority #5.
50. **Layout breakpoints (3.1)** — mostly good: every page collapses to one column (`max-[980px]`, `lg:`, `sm:` variants). Two gaps:
    - `Dashboard.jsx:241` — the stat grid stays `grid-cols-2` on the smallest screens with `text-[22px]` values; OK, but the left "Today's Feeding" aside has `minHeight: 480px` in prominent state (158) which forces dead space on mobile. LOW.
    - `FarmLog.jsx:223` summary strip is `grid-cols-3` always — at 320px the three cards get ~90px each with 2xl numbers; borderline. LOW.
51. **Touch targets (3.3)**: see issue #18. The primary action buttons (Complete & Next, Log Feeding, primary-button at min-height 38px) are *below* the 44px guideline — `.primary-button`'s `min-height: 38px` (index.css:149) should be 44px on mobile. MEDIUM.
52. **Forms on mobile (3.4) — iOS zoom**: `.field input` inherits 16px ✓, but these are below 16px and will trigger iOS auto-zoom: DaisyUI `input-sm`/`select-sm` (~14px) in FarmLog filters (152-217), Export date inputs (255), ObservationEntry custom-option input (178); `text-xs`(12px) inputs in BreedSelector inline add (167) and `font-mono text-sm`(14px) in FarmSetup feed form. MEDIUM. Date inputs use native `type="date"` ✓.
53. **Modals on mobile**: `.modal-card` is `max-height: calc(100vh - 40px)` + scroll ✓; ScaleHouse panels go full-width under 640px ✓; AnimalDrawer is `max-w-[480px]` with `w-full` ✓. FlockPickerModal list capped at `max-h-72` ✓. Good.
54. **Tables (3.5)**: covered in #23 — compliant except minor min-width gaps.
55. **Scale House on mobile (3.6)** — the core flow holds up well:
    - Daily flock card: grid collapses (`max-[980px]:grid-cols-[48px_minmax(0,1fr)]`), designation pills drop to a second row ✓.
    - Section headers: 13px uppercase mono — readable ✓.
    - **Complete & Next**: fixed bottom bar always visible without scrolling ✓ (this is the right pattern). The inline block-reason text above it can push the bar's height; fine.
    - Observation entry: pill grid `grid-cols-2 lg:grid-cols-3`, 48px min-height options ✓ — the best touch UI in the app.
    - Edit Day panel: full-width on ≤640px ✓ but z-index bug (Priority #5) and the 36px weight input font is good; the "← Back to log" text link is a small target. MEDIUM.
    - DailyModeBanner overflow at narrow widths — issue #24.
    - TodayLogPanel sits *below* the entry card on mobile with a 760px-wide scrolling table — usable but heavy; consider a card list under 640px. LOW.
56. **Font sizes (3.7)**: extensive use of `text-[10px]` (labels in ObservationEntry:202,217, ScaleHouse:1803,2266, FarmSetup:708, Export badges, AnimalDrawer:243,278) and `text-[11px]` — at or below the 11px floor for field readability in sunlight. Recommend 11px minimum, 12px for anything the user must read to act. MEDIUM.

---

## Performance Issues (Section 4)

57. **ScaleHouse boot effect re-runs on every quick-mode flock change** — `refreshQueue` is a `useCallback` with `quickFlockId` in deps (190-205), and the boot effect depends on `refreshQueue` (227-265). Selecting a different flock in Quick Entry re-triggers the full boot: queue + events + summary + scale status. Fix: drop `quickFlockId` from `refreshQueue` deps (use the functional-update pattern for the default selection) so boot runs once per user. MEDIUM-HIGH.
58. **Polling stack**: AppLayout runs two 60s intervals (full `getQueue` nested join + `getOpenFollowUps`), Dashboard adds a third (full `getDashboardOverview` — 8 parallel queries). Visiting the dashboard means ~10 queries/minute at idle. Replace badge polling with a cheap count select (`head: true, count: 'exact'`) or Supabase realtime. MEDIUM.
59. `getFlocks` unbounded fetch — Priority #10. Same pattern at smaller scale: `getFlockDetail` pulls *all* feeding/production/casualty rows for the flock then filters to 14/30 days in JS (flocksApi:112-141) — add `.gte('date', start30)` and a separate aggregate for all-time totals.
60. `getFullHierarchy` (onboardingApi:239-310) runs 5 sequential round trips (classes → types → breeds → flocks → assignments). It executes on **every auth state change** via `AuthContext.loadProfile → getOnboardingSummary`, i.e. on each app load and token refresh. Use one nested select (`animal_classes.select('..., animal_types(..., breeds(..., flocks(..., feed_assignments(...))))')`) — PostgREST supports it and the codebase already uses nested selects elsewhere. MEDIUM-HIGH.
61. `refreshEvents` (ScaleHouse:207) calls `getTodayEvents` + `getQueueSummary`, which between them query today's `feeding_events` twice and `flocks` twice. Merge into one service call. LOW-MEDIUM.
62. `logSession` is ~6 sequential round trips per flock (insert ×2-3, then flock + feed_type + next-unfed lookup which itself is 2 queries). In daily mode this runs per flock — noticeable on rural connections. Batch the post-insert reads or move to an RPC. MEDIUM.
63. **N+1-ish**: `exportService.fetchFeedingLog` does a second production query keyed per flock — fine; but `OnboardingWizard` saves breeds/flocks/feeds with sequential `await` in for-loops (saveStep2/3/4) — use one bulk `insert([...])` each. LOW (onboarding-only).
64. **Bundle size (4.3)**: `exceljs` (~250KB gz), `jspdf` + `jspdf-autotable` (~120KB gz) are statically imported by `exportService.js`, which Export.jsx imports at module top — they're in the main bundle for every user. `recharts` (~100KB gz) likewise loads for everyone though only Financials uses it. There is **no route-level code splitting** (`App.jsx` imports all pages eagerly). Fix: `React.lazy` the routes, and `await import('./exportService')` inside `handleGenerate`. HIGH impact, low effort.
65. Hook hygiene: `AuthContext` `value` useMemo (191-204) omits `signIn/signUp/signOut/refreshProfile` from deps (they're recreated each render but the memo never refreshes them — works only because they close over stable setters; fragile). `FarmContext` provider value is a new object every render (43) — every `useFarm` consumer re-renders whenever AuthContext changes. Wrap in `useMemo`. LOW.
66. `Financials.jsx:87` — `totals` reduce runs every render (not memoized) and `sortedFlocks` re-sorts on each sort click — fine at this scale; LOW/skip.

---

## Code Quality Issues (Section 5)

67. **Duplicated utilities (5.1)** — the largest cleanup opportunity:
    - `fmt(error, fallback)` copy-pasted in 7 service files (flocksApi, scaleHouseApi, inventoryApi, financialsApi, dashboardApi, onboardingApi, revenueApi, exportApi).
    - `feedStatus(ft)` in 4 files (flocksApi:359, scaleHouseApi:15, inventoryApi:7, dashboardApi:7) + reimplemented inline in exportService (398, 659).
    - `getLocalDateString` in 3 files; `todayString`/`todayStr` UTC variants in 6 page files; `offsetDate`/`daysAgo` twice; `defaultRange`/`rangeFor` duplicated in Export, FarmLog, Financials.
    - `formatMoney`/`formatNumber`/`formatTime` re-declared in Dashboard, FlockList, FlockDetail, Inventory, Financials, ScaleHouse.
    - `round2/3/4` in flocksApi + exportApi (and inline `Math.round(x*100)/100` ~30 times elsewhere).
    - `formatError` in FlockList, OnboardingWizard, FarmSetup, FlockDetail (two shapes).
    - `feedTypeJson` in inventoryApi:14 and onboardingApi:314 (slightly divergent — one falls back `cost_per_unit ?? costPerLb`, the other recomputes).
    - `dismissInventoryAlert` implemented identically in dashboardApi:177 and inventoryApi:178.
    - `deleteEvent` (scaleHouseApi:288) vs `deleteFeedingEvent` (daySessionApi:102) — two delete paths for the same row.
    - Observation grouping/rendering: Dashboard "Today's Observations" (392-468) is a near copy of FarmLog's grouped rows (269-343); extract a `FlockObservationGroup` component.
    - Flock row mapping (`breed_name`, `class_type`, `emoji`, `produces_*` from the nested join) is repeated in flocksApi ×2, scaleHouseApi, dashboardApi — extract `normalizeFlockRow(flock)`.
    → Create `src/utils/format.js`, `src/utils/date.js`, `src/services/_shared.js`.
68. **Prop drilling (5.2)**: `ScaleEntryCard` receives **~70 props** (ScaleHouse:624-698) including 20+ setters; `panelProps` bundles 11 more for the panels. This is the clearest sign `ScaleHouse.jsx` (2,480 lines) needs decomposition — either a `ScaleSessionContext`/reducer or splitting the entry form into self-contained sections owning their own state. HIGH (maintainability).
69. **Oversized files**: ScaleHouse.jsx 2,480 lines (page + 2 panels + 3 modals + entry card), FarmSetup.jsx 938, FlockDetail.jsx 889 (page + 5 modals + table). Move sub-components to files. MEDIUM.
70. **Hardcoded values (5.3)**:
    - Designation list `["layer","breeder","meat","mixed"]` hardcoded in FlockList:12 and FarmSetup:28, ignoring the per-class `designations` in `CLASS_CONFIG` (a goat herd gets poultry designations in those editors; OnboardingWizard does it correctly via `getDesignationsForBreed`). MEDIUM bug-adjacent.
    - Sidebar width 240px appears as `gridTemplateColumns: "240px ..."` (AppLayout:90), `w-60` (AppLayout:118), and `lg:left-[240px]` (ScaleHouse:704) — three encodings of one constant.
    - localStorage keys `"Flock_user_id"`/`"Flock_farm_name"` repeated as string literals in 5 files — constants module.
    - Par-level multipliers (×2 warning, ×3 meter denominator), 60000ms poll interval, 90-day observation window, `isLayer = ["layer","breeder","mixed"]` (flocksApi:154) vs Financials' `["layer","breeder"]` (240) — the two disagree about whether "mixed" flocks get cost/dozen.
    - No hardcoded flock/user IDs found ✓.
71. **State management (5.4)**: ScaleHouse holds ~35 `useState` hooks in one component; the litter/egg/water/feed fields belong in one `entryForm` object (like EditPanel's `editForm`, which is the better pattern in the same file). Settings.jsx manages 3 unrelated wizards (email/password/farm) in one component — acceptable but split-ready. Inventory's `editValue` is sometimes a string, sometimes an object (`{bag_weight,bag_price}`) — type-shifting state invites bugs.
72. **API consistency (5.5)**:
    - **Canonical join path: PASS.** Every service uses `breeds → animal_types → animal_classes`; the only `breeds.animal_classes` references are intentional legacy fallbacks in `utils/animalClass.js:63,76`. No old-path queries remain.
    - Error style splits: half the services throw `fmt(error, friendly)` (flocksApi, inventoryApi…), the other half throw raw Supabase errors (`observationsApi`, `daySessionApi` — `if (error) throw error`). Standardize on `fmt`.
    - `getQueue(userId)`, `getTodayEvents(userId)`, `getTodayObservations(userId)`, `getObservationHistory(userId, …)` all accept a `userId` they never use (RLS handles scoping) — callers pass it inconsistently (`getQueue()` in FarmLog/Export vs `getQueue(userId)` elsewhere). Drop the params.
    - `exportService.fetchFlocks` filters by user **client-side** with `parseInt(userId)` after fetching everything — dead code anyway (see #42), delete it.
    - `getFlockAnimals` (observationsApi:167) derives `latest_weight` from `animal_weight_logs?.[0]` without ordering the embedded array — PostgREST does not guarantee embed order, so "latest weight" may be any weight. Add `.order('date', { referencedTable: 'animal_weight_logs', ascending: false }).limit(1, { referencedTable: ... })` or sort client-side. MEDIUM bug.
    - `EditPanel.handleSave` writes derived columns (`cost_total`, `weight_per_bird`, `cost_per_bird`) into `feeding_events` while every read path recomputes them from `total_weight × cost_per_lb_at_time` — the stored values can drift from the displayed ones (headcount used at edit time differs from read time). Store only the raw fields. MEDIUM.
    - EditPanel sets `egg_count: editForm.eggCount || null` (1145) — editing a count down to 0 erases it to NULL ("skipped") instead of recording zero eggs. Same for litter fields. LOW-MEDIUM.
    - `CustomSpeciesForm.handleSubmit` creates the class, then the type, with no rollback — a type failure leaves an orphan empty class. LOW.
    - Inventory `submitPurchase` refresh quirk: it calls `loadTransactions(feedId)` while that feed is already expanded, which *toggles it closed* and returns without refetching, then re-expands with stale rows (Inventory:96-99) — the new purchase doesn't appear in the open history. MEDIUM.

---

## What's Working Well

- **The animal-class abstraction is genuinely good.** `SPECIES_MAP` / `CLASS_CONFIG` / `getProductionFlags` with nested-or-flat fallbacks, surfaced through `useAnimalClass`, lets every page speak the right vocabulary (Herd/Kits/Calves) and show/hide eggs/litter/milk sections with almost no per-page logic.
- **Canonical join path discipline.** All eleven service files query `breeds → animal_types → animal_classes` consistently; the migration from the old direct path is complete with only deliberate fallbacks left in the utility layer.
- **Service-layer separation is clean.** Pages never touch `supabase` directly except three justified spots (FlockDetail litter query, FarmSetup feed insert/assignments, ScaleHouse EditPanel obs) — and each is a candidate for promotion, not a smell epidemic.
- **Scale House daily flow is thoughtfully designed for the field**: fixed always-visible Complete & Next bar, skip/back with history, "already logged" review card, inline block-reason messaging, backdate warning banner, and the queue chips with pulse animation. The observation entry pills (48px targets, 2-3 column grid) are the best mobile UI in the app.
- **Mobile fundamentals**: drawer nav with backdrop and route-close, `pt-20` top-bar clearance, panels going full-width under 640px, every data table wrapped in horizontal scroll, native date inputs, and `max-[980px]` collapses on every multi-column layout.
- **Defensive data handling**: `Math.max(headcount, 1)` division guards everywhere, alert deduplication, race-safe profile creation (`createProfileForAuthUser` retry-on-conflict), inventory running-balance reconstruction, and trigger-based inventory side effects with reversal on delete.
- **Auth flow** covers session restore, auth-expired broadcast events, password-verify-before-change, and a real reset flow — more complete than most MVPs.
- The PDF/XLSX export theming (`exportService.js`) is polished — branded cover page, styled sheets, totals rows with formulas, severity-colored cells.

---

## Recommended Priority Order

1. **Fix the data-visibility bugs** — add `individual_tracking_enabled` to `getFlockDetail`/`getQueue` selects (Priority #1), fix the FlockDetail breed path (#3) and dead "Log litter" button (#4). Small diffs, user-facing features come alive.
2. **Unify date handling** — create `src/utils/date.js` with `getLocalDateString()` and replace all UTC `toISOString().slice(0,10)` calendar dates (#2). This kills a whole class of "where did my entry go" bugs.
3. **Z-index + touch fixes for the field workflow** — raise Review/Edit panels above the top bar (#5), make the Today's Log delete visible on touch (#6), bump `.primary-button` to 44px min-height (#51), rename the conflicting `.modal-backdrop` class (#8).
4. **Add error surfacing to all mutations** — Inventory first (#9), then the silent-catch cluster (#32-34). Reuse the existing `error-banner` / `InlineFeedback` patterns.
5. **Stop the unbounded/redundant fetching** — server-side flock stats or date-filtered queries in `getFlocks`/`getFlockDetail` (#10, #59), single nested select for `getFullHierarchy` (#60), fix the ScaleHouse boot-refetch loop (#57), lighten the AppLayout badge polling (#58).
6. **Code-split the bundle** — `React.lazy` routes and dynamic-import exceljs/jspdf in Export (#64). One afternoon, large win for first load on rural connections.
7. **Fix onboarding step-1 duplication** (#7) and per-class designations in FlockList/FarmSetup editors (#70).
8. **Consolidate shared utilities** — `format.js`, `date.js`, services `_shared.js` (fmt, feedStatus, feedTypeJson, normalizeFlockRow) (#67). Mechanical, big maintainability payoff.
9. **Register fonts in Tailwind config** (#1.1.1) and then sweep the three font idioms and hardcoded hexes to utilities/vars (#1.1.2-3).
10. **Standardize the component kit** — one modal frame (with 44px close), one button system, one field pattern, one loading/empty state (#5-10 in Design Patterns). Do it as a living style decision applied to new code first, then migrate page-by-page.
11. **Decompose ScaleHouse.jsx** — extract panels/modals to files and replace the 70-prop `ScaleEntryCard` with a context or section-owned state (#68-69). Do this after the kit exists so extraction lands on the new patterns.
12. Cleanup pass: remove dead code (#36-46), drop `react-datepicker`, delete unused service functions, and decide whether `MobileBottomNav` is still planned (#48).
