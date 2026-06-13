# Flock — Revenue Removal & Terminology Diagnostic

Date: 2026-06-13
Scope: read-only audit of `farmbright/src/` ahead of the revenue-removal + terminology-cleanup sprint.
No files were changed.

## Summary Table

| Category | Count | Action |
|----------|-------|--------|
| Revenue table query references | 10 call-sites across 4 files | Remove / simplify |
| Revenue UI components & sections | 6 | Remove (1 whole page) / Modify |
| Hardcoded bird terms (display path) | 14 display strings + 1 config source | Fix dynamically |
| Files safe to delete entirely | 0 (1 becomes deletable after callers are edited) | — |
| Files needing partial edit | 7 | Modify |
| Export report types to remove/modify | 1 (Financial Summary → costs only) | Modify |

**Three things to know before you start:**

1. **`egg_sales`, `meat_sales`, `breeding_sales`, `milk_sales`, `financial_records` are NOT tables.** The only revenue tables actually queried are **`revenues`** and **`young_sales`**. The strings `egg_sales`/`meat_sales`/`breeding_sales` appear only as `source` *values* written into a `revenues` row (the source-type picker in the Log Revenue modal). `milk_sales` and `financial_records` do not appear anywhere in `src/`.
2. **The Export page has a cost/revenue split-brain.** Downloads use `exportService.js`, whose "Financial Summary" is **cost-only** (no revenue tables). But the on-screen *preview* uses `exportApi.js`, whose financial rows **do** query `revenues` and print Revenue / Net P&L columns. So the preview shows revenue the actual file never contains. (`exportApi.generateExport` is dead — only its preview path is live.)
3. **`cost_per_bird` / `weight_per_bird` are derived JS fields, not DB columns.** They're computed in the service layer from `total_weight × cost_per_lb_at_time ÷ headcount`. Keep the math; only the *labels* ("Cost/Bird", "Wt/Bird") need to become dynamic per animal class.

---

## SECTION 1 — Revenue Tables In Use

### revenues
- **src/services/financialsApi.js:45** — function `getFinancialSummary()`
  - operation: SELECT `flock_id, date, amount` from `revenues`, filtered `gte/lte date`
  - called by: `src/pages/finances/Financials.jsx:50` (`refresh`)
- **src/services/financialsApi.js:121** — function `getFlockFinancials()`
  - operation: SELECT `flock_id, date, amount` from `revenues`, filtered by date
  - called by: `src/pages/finances/Financials.jsx:51`
- **src/services/financialsApi.js:190** — function `createRevenue()`
  - operation: INSERT `{ user_id, flock_id, date, amount, source, notes }` into `revenues`, returns row + `flocks(name)`
  - called by: `src/pages/finances/Financials.jsx:94` (`submitRevenue`, the Log Revenue FAB modal)
- **src/services/financialsApi.js:211** — function `getRevenueHistory()`
  - operation: SELECT `id, user_id, flock_id, date, amount, source, notes, flocks(name)` from `revenues`
  - called by: **nobody** — not imported anywhere. Dead code.
- **src/services/dashboardApi.js:59** — function `getDashboardOverview()`
  - operation: SELECT `amount` from `revenues` where `date = yesterday`; used to compute `yesterday.net_pl`
  - called by: `src/pages/dashboard/Dashboard.jsx:51` (`fetchOverview`)
- **src/services/exportApi.js:124** — function `fetchFinancialRows()` (helper for `getExportPreview`)
  - operation: SELECT `flock_id, amount` from `revenues` by date; feeds Revenue / Net P&L preview columns
  - called by: `getExportPreview` → `src/pages/reports/Export.jsx:48` (preview only)

### young_sales
- **src/services/revenueApi.js:10** — function `logYoungSale()`
  - operation: INSERT `{ flock_id, date, quantity, price_per_head, notes }` into `young_sales`
  - called by: `src/pages/flocks/FlockDetail.jsx:118` (`submitYoungSale`)
- **src/services/revenueApi.js:26** — function `getYoungSales(startDate, endDate)`
  - operation: SELECT `*, flocks(... breeds → animal_types → animal_classes ...)` from `young_sales`
  - called by: **nobody** — not imported anywhere. Dead code.
- **src/services/revenueApi.js:43** — function `getFlockYoungSales(flockId)`
  - operation: SELECT `id, date, quantity, price_per_head, total_amount, notes` from `young_sales`
  - called by: `src/pages/flocks/FlockDetail.jsx:54` (`refresh`)
- **src/services/revenueApi.js:53** — function `deleteYoungSale(id)`
  - operation: DELETE from `young_sales` by id
  - called by: **nobody** — not imported anywhere. Dead code.

### egg_sales / meat_sales / milk_sales / breeding_sales / financial_records
- **No table queries exist for any of these.** `egg_sales`, `meat_sales`, `breeding_sales` appear only as literal `source` option values in the revenue modal:
  - `src/pages/finances/Financials.jsx:286` — `useState("egg_sales")` (default source)
  - `src/pages/finances/Financials.jsx:316` — `["egg_sales", "meat_sales", "breeding_sales", "other"]` (source buttons)
  - These are stored in `revenues.source`. `milk_sales` and `financial_records` are absent from the codebase entirely.

---

## SECTION 2 — Revenue UI Components

### 2.1 Dedicated revenue/sales pages
- **src/pages/finances/Financials.jsx** — route `/financials` (App.jsx:43; nav in AppLayout.jsx:30, MobileBottomNav.jsx:14).
  Renders the entire farm-economics page: KPI cards (Feed Cost, Revenue, Net P&L, Avg Cost/Bird), a "Daily Feed Cost vs Revenue" area chart, a "P&L by Flock" bar chart, a sortable per-flock table with Revenue / Net P&L / Cost/Dozen columns, a floating "Log revenue" FAB, and the `RevenueModal`.
  **Disposition: heavily revenue-coupled but NOT 100% revenue.** It also shows feed-cost KPIs and a cost chart. Decide: delete the page outright (and its nav entries + route), or strip it to a cost-only "Costs" page. The chart and table are revenue-blended (see 2.2 / Section 4).

### 2.2 Revenue sections inside other pages
- **Dashboard — Yesterday's P&L card:** `src/pages/dashboard/Dashboard.jsx:278–289` renders a card showing `formatSignedMoney(yesterday.net_pl)` titled "Yesterday's P&L" (`pnlPositive` tone logic at line 100). Driven by `dashboardApi` revenues query. → **Remove the card** (or replace with "Yesterday's Feed Cost", which is already fetched at `yesterday.total_feed_cost`).
- **FlockDetail — Young Sales section:** `src/pages/flocks/FlockDetail.jsx:299–322` renders a `{youngTerm} Sales` panel (table of qty / $/head / total) when `producesYoung && youngSales.length > 0`, plus a "Record sale" link. → **Remove section.**
- **FlockDetail — "Sell {youngTerm}" header button:** lines 201–205 (opens the young-sale modal). → **Remove button.**
- **FlockDetail — Cost per Dozen StatCard:** lines 221–226 (`stats.current_cost_per_dozen`). This is a *cost* metric (feed cost ÷ eggs × 12), not income — but it reads as P&L-adjacent. → **Likely KEEP** (cost-only), confirm with product.
- **Financials — Revenue KPI + P&L KPI:** `Financials.jsx:146` (Revenue) and `:148–151` (Net P&L). → **Remove.**

### 2.3 Revenue modal components
- **`RevenueModal`** — defined inline in `src/pages/finances/Financials.jsx:287–348`. Amount input, source-type picker (egg/meat/breeding/other), flock selector, date, notes; calls `createRevenue`. → **Remove** (goes with the page or with revenue stripping).
- **`YoungSaleModal`** — defined inline in `src/pages/flocks/FlockDetail.jsx:767–813`. Date / qty / price-per-head / notes; calls `submitYoungSale` → `logYoungSale`. → **Remove.**
- No standalone `LogSaleModal.jsx` / `SaleForm.jsx` files exist; both modals are inline.

### 2.4 Revenue in navigation
- **Sidebar (AppLayout.jsx:30):** `{ to: "/financials", label: "Financials", icon: TrendingUp }`. → Remove or relabel if page is repurposed to costs.
- **MobileBottomNav.jsx:14:** `{ label: 'Finances', icon: TrendingUp, path: '/financials' }`. → Same. (If `/financials` is removed entirely, this leaves the bottom nav with 4 items — pick a replacement, e.g. Flocks or Inventory, to keep 5.)
- No revenue link in the Dashboard quick-actions.

---

## SECTION 3 — Hardcoded Terminology

Legend: **A** = user-facing label (fix to dynamic `headTerm`/`youngTerm`) · **B** = DB/derived field name (leave, fix display only) · **C** = variable/function name · **D** = config source-of-truth / comment.

### Source of truth (leave as-is — this IS the dynamic system)
- **src/utils/animalClass.js:26** — `headTerm:'Birds', headTermSingular:'Bird'` (poultry config). **(D)** This is the lookup table the dynamic fixes should pull from; not a bug.
- **src/utils/animalClass.js:27,31,35,39,43,47,51** — `youngTerm` values (`Chicks`, `Piglets`, `Kids`, `Calves`, `Kits`, `Pups`, `Young`). **(D)** Source of truth.

### "Wt/Bird" / "Cost/Bird" / "$/Bird" / "lbs/bird" — hardcoded display labels (A)
- **src/pages/flocks/FlockDetail.jsx:239** — DataTable columns `"Wt/Bird"` and `"$/Bird"`. **(A)** Should derive from `animalClass.headTermSingular`.
- **src/pages/finances/Financials.jsx:152** — KPI label `"Avg Cost/Bird"`. **(A)** (Farm-wide page mixes classes — may need "per head" generic.)
- **src/pages/scale-house/ScaleHouse.jsx:513** — `SummaryTile label="Cost/Bird"` (completion screen). **(A)**
- **src/pages/scale-house/ScaleHouse.jsx:954** — Review panel summary `{ label: "Cost/Bird", ... }`. **(A)**
- **src/pages/scale-house/ScaleHouse.jsx:973** — `... lbs/bird` in per-flock review line. **(A)**
- **src/pages/scale-house/ScaleHouse.jsx:1320** — `{formatMoney(editCostCalc.perBird)}/bird` in Edit panel. **(A)**
- **src/pages/scale-house/ScaleHouse.jsx:2346** — `lbs/bird` cost-detail label. **(A)**
- **src/pages/scale-house/ScaleHouse.jsx:2358** — `cost/bird` cost-detail label. **(A)**
- **src/services/exportApi.js:72** — feeding header `"Wt/Bird"`, `"Cost/Bird"`. **(A)** export label.
- **src/services/exportApi.js:134** — financial header `"Cost/Bird"`. **(A)** export label (also has Revenue / Net P&L — see Section 7).
- **src/services/exportService.js:182–183** — CSV headers `'Wt/Bird'`, `'Cost/Bird ($)'`. **(A)** export label.
- **src/services/exportService.js:571,573** — XLSX column headers `'Wt/Bird'`, `'Cost/Bird ($)'`. **(A)** export label.

> Note: export labels are static column headers in files that may span mixed animal classes; "per head" is likely the cleanest generic rather than per-row dynamic terms.

### "Birds" / "Chicks" standalone labels
- No hardcoded standalone `"Birds"`/`"Chicks"` UI labels exist outside `animalClass.js`. Every page already routes head/young terminology through `animalClass.headTerm` / `youngTerm` (e.g. FlockDetail.jsx:216 `Current ${animalClass.headTerm}`, ScaleHouse headcount/litter sections). The terminology system is in good shape — only the `/bird` cost/weight labels above were left static.

### "Flock" / "Flocks" — hardcoded where `groupTerm` could apply
The app uses literal "Flock"/"Flocks" pervasively as the brand/section vocabulary even for herds/colonies. Representative spots (not exhaustive — this is a product decision, not a bug list):
- **src/pages/scale-house/ScaleHouse.jsx** — "Flocks Logged"/"Flocks Fed" tiles (513-area), DailyModeBanner `Flock X of Y` (768), DailyProgress "flocks fed today" (1662), completion table header `"Flock"` (520).
- **src/pages/dashboard/Dashboard.jsx** — "Today's Feeding … flocks fed" (163), "Flocks Fed Today" KPI (269).
- **src/pages/flocks/FlockList.jsx** — page title "Flocks" (59), "Add Flock" (64), empty-state copy.
- **src/pages/finances/Financials.jsx** — table column "Flock", "P&L by Flock" (174).
- **src/services/exportApi.js / exportService.js** — "Flock" CSV/PDF/XLSX headers.
  `getClassConfig(...).groupTerm` exists (`Flock`/`Herd`/`Colony`/`Pack`/`Group`) but is rarely used in these labels. **(A)** — fix only if the sprint scope includes group-term theming; otherwise out of scope.

---

## SECTION 4 — Financials Page Current State

File: `src/pages/finances/Financials.jsx` (route `/financials`).

### 4.1 Sections present
1. **Header** (108–143): title + period toggle (Today / This Week / This Month / Custom + custom date inputs).
2. **KPI row** (147–156): four `Kpi` cards.
3. **Charts row** (158–193): two charts (see 4.4).
4. **Per-flock table** (195–257): sortable; columns name, breed, designation, headcount, feed cost, revenue, net P&L, cost/bird, cost/dozen; totals footer.
5. **Log Revenue FAB** (259–266) + **`RevenueModal`** (268–270, defined 287–348).

### 4.2 Cost-related (KEEP)
- KPI: **Feed Cost** (145), **Avg Cost/Bird** (152).
- Chart: the **cost** series of the area chart.
- Table columns: feed cost, headcount, cost/bird, cost/dozen.
- Period selector + totals footer (feed portion).

### 4.3 Revenue-related (REMOVE)
- KPI: **Revenue** (146), **Net P&L** (148–151).
- Chart: the **revenue** area series; the entire **P&L by Flock** bar chart.
- Table columns: **total_revenue** (230), **net_pl** (231–233); default sort `net_pl` (36) must change.
- Totals footer: `revenue` and `net` accumulators (85–90).
- **Log Revenue FAB + RevenueModal** entirely.
- `avgCostPerBird` stays; `submitRevenue` (94) + `createRevenue` import go.

### 4.4 Charts
- **"Daily Feed Cost vs Revenue"** area chart (159–173): two series — `cost` (KEEP) and `revenue` (REMOVE). → becomes a single-series "Daily Feed Cost" area. Retitle.
- **"P&L by Flock"** bar chart (175–192): `net_pl` per flock, colored by sign. → **REMOVE entirely** (purely P&L). Consider replacing with "Feed Cost by Flock" if a second chart is still wanted.

### 4.5 API imports (line 10–11)
- `getFinancialSummary` — **MODIFY** (drop `revenues` query + `total_revenue`/`net_pl`/`revenueByDay`; keep feed-cost-by-day + totals).
- `getFlockFinancials` — **MODIFY** (drop `revenues` query + `total_revenue`/`net_pl`; keep feed cost, cost/bird, cost/dozen).
- `createRevenue` — **REMOVE** import (and the function if no other caller — none exists).
- `getQueue` (from scaleHouseApi, line 11) — **KEEP** (populates the flock dropdown in RevenueModal; if the modal is removed, this import can go too).

---

## SECTION 5 — Files Safe to Delete Entirely

- **src/services/revenueApi.js** — 100% `young_sales` (revenue). `getYoungSales` and `deleteYoungSale` are already dead; `logYoungSale` and `getFlockYoungSales` are imported only by `FlockDetail.jsx:11`.
  - Imported by: `src/pages/flocks/FlockDetail.jsx` (2 of 4 functions).
  - **SAFE TO DELETE: no, not yet.** Becomes deletable once `FlockDetail.jsx` drops its import + the young-sales section/modal/handlers. After that, delete the whole file.
- **src/pages/finances/Financials.jsx** — **partial.** Not 100% revenue (has cost KPIs/chart/table). Delete only if the product decision is to drop the page entirely (then also remove route App.jsx:43 and nav entries AppLayout.jsx:30, MobileBottomNav.jsx:14). Otherwise modify per Section 4.
- **No other revenue-only files exist** (no `Revenue.jsx`, `Sales.jsx`, `LogSaleModal.jsx`, `RevenueChart.jsx`, revenue util). Modals are inline.

**Net: 0 files deletable with zero other edits; `revenueApi.js` is deletable second, after `FlockDetail.jsx` is edited.**

---

## SECTION 6 — Database Columns to Note

- **`cost_per_bird`** — derived (not a stored column). Computed in `flocksApi.js:344`, `scaleHouseApi.js:131,356`, `daySessionApi.js:52`, `exportService.js:82`, `financialsApi.js:170`, and recomputed in `ScaleHouse.jsx` EditPanel (1135). Keep the math; display as "cost per {headTermSingular}" / "per head".
- **`weight_per_bird`** — derived (not stored). `flocksApi.js:342`, `scaleHouseApi.js:354`, `daySessionApi.js:51`, `exportService.js:80`, `ScaleHouse.jsx:1133`. Display as "wt per {headTermSingular}".
  - ⚠️ Note: `ScaleHouse.jsx` EditPanel (`daySessionApi.updateFeedingEvent`) *writes* `weight_per_bird`/`cost_per_bird` into the `feeding_events` UPDATE payload (lines 1135–1140). If those are real columns they persist; every read path otherwise recomputes them. Out of scope for revenue removal but flagged.
- **`young_sales.total_amount`** — revenue (price × qty, likely DB-generated). Goes with the young-sales removal.
- **`revenues.amount` / `.source`** — revenue. Goes with revenue removal.

### Queries that pull revenue alongside cost (need splitting/simplifying)
- **financialsApi.js `getFinancialSummary`** (35–47): parallel `flocks` + `feeding_events` (cost) + `revenues` (income) in one `Promise.all`. → drop the revenues leg.
- **financialsApi.js `getFlockFinancials`** (108–128): parallel `flocks` + `feeding_events` + `revenues` + `production_logs`. → drop revenues leg; keep production_logs (for cost/dozen).
- **dashboardApi.js `getDashboardOverview`** (28–67): 8-way `Promise.all` including `yesterdayRevenueResult` (`revenues`). → drop that leg + the `yesterday.net_pl` computation (line 165–166).
- **exportApi.js `fetchFinancialRows`** (120–125): parallel `flocks` + `feeding_events` + `revenues` + `production_logs`. → drop revenues leg; remove Revenue / Net P&L output columns (line 134, 150–151).

---

## SECTION 7 — Export Service Revenue References

There are **two** export modules. `Export.jsx` generates downloads via **`exportService.js`** and renders the preview via **`exportApi.js`**.

### 7.1 Report types
From `exportService.js` (download path) and `Export.jsx` reportOptions:
- **Feeding Log** (`exportService.js:178,349`) → **KEEP**
- **Production Log** (`:204,371`) → **KEEP**
- **Inventory** (`:219,391`) → **KEEP**
- **Financial Summary** (`:233,423`) → **MODIFY** — see 7.2/7.3.
- **Observations & Notes** (`:240,447`) → **KEEP** (not revenue).
- There is **no separate "Revenue/Sales" report type** to remove — revenue is embedded in Financial Summary.

### 7.2 Functions that query revenue tables
- **`exportService.js` — `fetchFinancials()` (line 141):** queries **only `feeding_events`** (`total_weight, cost_per_lb_at_time`) → outputs `{ name, total_cost }`. **No revenue table touched.** The downloaded Financial Summary is already cost-only (CSV header "Total Feed Cost ($)" at :235; PDF "Total Feed Cost" at :429; XLSX "Total Feed Cost" at :689). → **Minimal/no change needed for the download path.**
- **`exportApi.js` — `fetchFinancialRows()` (line 119, queries `revenues` at :124):** used by `getExportPreview` (preview only). Outputs Revenue and Net P&L. → **MODIFY**: drop the `revenues` query and the Revenue / Net P&L columns so the preview matches the cost-only download.

### 7.3 Output columns showing revenue
- **exportApi.js:134** — financial preview headers include **"Revenue ($)"** and **"Net P&L ($)"** (rows built at :150–151). Format: on-screen **preview table** (and CSV if `generateExport` were ever wired up — it currently is not). → Remove these two columns.
- **exportService.js** — Financial Summary output has **no** revenue columns in any format (CSV/PDF/XLSX all emit only Flock + Total Feed Cost). → No revenue columns to remove; just confirm the label.
- No revenue columns appear in Feeding, Production, Inventory, or Observations outputs.

---

DIAGNOSTIC COMPLETE — REVENUE_DIAGNOSTIC.md saved at project root.
