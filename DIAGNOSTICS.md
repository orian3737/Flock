# FarmBright — Diagnostic Reference
**Branch:** `sprint-3-db` | **Date:** 2026-06-07 | **Stack:** React 19 + Vite 6, Supabase JS v2, DaisyUI 5 + Tailwind 3, Netlify

---

## 1. Database Schema (live state)

### Auth / Identity
| Table | Key columns | Notes |
|---|---|---|
| `auth.users` | `id uuid` | Supabase managed |
| `public.users` | `id integer PK`, `supabase_uid uuid FK→auth.users`, `email`, `farm_name`, `display_name`, `preferences json` | App's integer user identity |

**Critical:** `userId` everywhere in the app is `users.id` (integer), NOT `auth.uid()` (uuid). The bridge is `current_app_user_id()` which does `SELECT id FROM users WHERE supabase_uid = auth.uid()`.

### Animal Hierarchy (3-level — added Sprint 3)
```
animal_classes (id int, user_id int, name, class_type)
  └── animal_types (id int, animal_class_id int FK, name, species, emoji,
                    produces_eggs, produces_milk, produces_meat, produces_young,
                    working_animal, produces_fiber, produces_honey)
        └── breeds (id int, animal_type_id int FK, name)
              └── flocks (id int, breed_id int FK, name, designation, pen_name,
                         current_headcount, created_at)
```

**Before Sprint 3:** `animal_classes → breeds` (2-level, production flags on animal_classes).  
**After Sprint 3:** `animal_classes → animal_types → breeds` (3-level, production flags moved to animal_types).

### class_type enum values
`'poultry' | 'swine' | 'goat' | 'cattle' | 'rabbit' | 'guardian' | 'other'`

### Operations / Livestock
| Table | Key columns |
|---|---|
| `feed_types` | `id int`, `user_id int`, `name`, `unit`, `cost_per_unit`, `bag_weight`, `bag_price`, `par_level`, `current_on_hand` |
| `feed_assignments` | `id int`, `flock_id int`, `feed_type_id int` |
| `feeding_events` | `id int`, `flock_id`, `feed_type_id`, `date`, `timestamp`, `total_weight`, `cost_per_lb_at_time`, `input_method` |
| `production_logs` | `id int`, `flock_id`, `date`, `egg_count`, `water_consumed`, `notes`, `litter_count`, `litter_size`, `milk_gallons` |
| `casualty_logs` | `id int`, `flock_id`, `date`, `change_amount`, `notes` |
| `breeding_logs` | `id int`, `flock_id`, `male_id`, `female_id`, `date`, `outcome_notes`, `expected_hatch_date` |

### Financial
| Table | Key columns |
|---|---|
| `revenues` | `id int`, `user_id int`, `flock_id int nullable`, `date`, `amount`, `source`, `notes` |
| `financial_records` | `id int`, `flock_id int`, `date`, `total_feed_cost`, `total_revenue`, `net_pl`, `cost_per_bird`, `revenue_source` |
| `young_sales` | `id bigint`, `flock_id bigint`, `date`, `quantity`, `price_per_head`, `total_amount`, `notes`, `young_term` |
| `milk_sales` | `id bigint`, `flock_id bigint`, `date`, `gallons`, `notes` |
| `inventory_transactions` | `id int`, `feed_type_id int`, `date`, `transaction_type`, `quantity_change`, `unit_cost`, `bag_weight`, `bag_price`, `cost_per_lb` |
| `alerts` | `id int`, `user_id int`, `feed_type_id int nullable`, `alert_type`, `message`, `is_read` |

---

## 2. RLS Policies

### Critical rule — DO NOT violate
> **Never call `current_app_user_id()` through a `security definer` wrapper in RLS policies.**  
> In PostgreSQL 15+, `auth.uid()` returns NULL inside security definer functions, silently breaking all ownership checks. Always inline the ownership expression directly in the policy body.

### Working pattern (inline)
```sql
-- CORRECT
create policy "breeds_select" on breeds for select
  using (
    animal_type_id in (
      select id from animal_types
      where animal_class_id in (
        select id from animal_classes where user_id = current_app_user_id()
      )
    )
  );

-- WRONG — current_app_user_id() returns null from inside security definer
create policy "breeds_select" on breeds for select
  using (user_owns_breed(id));  -- security definer wrapper fails
```

### Current policy state
| Table | Policies |
|---|---|
| `animal_classes` | `animal_classes_own` FOR ALL: `user_id = current_app_user_id()` |
| `animal_types` | `Users manage own animal_types` FOR ALL: inline via animal_classes |
| `breeds` | `breeds_insert` INSERT, `breeds_select_update_delete` SELECT, `breeds_update` UPDATE, `breeds_delete` DELETE — all inline via animal_types → animal_classes |
| `flocks` | `flocks_insert` INSERT, `flocks_select` SELECT, `flocks_update` UPDATE, `flocks_delete` DELETE — all inline via breeds → animal_types → animal_classes |
| `young_sales` | `young_sales_user_isolation` FOR ALL — inline via flocks chain |
| `milk_sales` | `milk_sales_user_isolation` FOR ALL — inline via flocks chain |

### Custom DB functions
```sql
current_app_user_id() → integer   -- security definer, SELECT id FROM users WHERE supabase_uid = auth.uid()
get_my_user_id()      → integer   -- created during Sprint 3 debug, same logic as above (redundant, safe to leave)
user_owns_breed(breed_id int) → boolean  -- security definer, NOW USES animal_type_id join (updated Sprint 3)
user_owns_flock(flock_id int) → boolean  -- security definer, NOW USES animal_type_id join (updated Sprint 3)
user_can_insert_breed(animal_type_id int) → boolean  -- security definer, created Sprint 3, NOT used in policies (inline instead)
user_can_insert_flock(breed_id int) → boolean  -- security definer, created Sprint 3, NOT used in policies (inline instead)
```

---

## 3. Service Layer

### `src/services/onboardingApi.js` — hierarchy CRUD
```
createAnimalClass(userId, { name, class_type })
updateAnimalClass(id, { name, class_type })
deleteAnimalClass(id)                          -- guards: checks animal_types count first

createAnimalType(animalClassId, { name, species, emoji, produces_eggs, produces_milk,
                                  produces_meat, produces_young, working_animal })
updateAnimalType(animalTypeId, fields)
deleteAnimalType(animalTypeId)                 -- guards: checks breed count first

createBreed(animalTypeId, name)                -- uses animal_type_id FK, NOT animal_class_id
updateBreed(breedId, name)
deleteBreed(breedId)                           -- guards: checks flock count first

createFlock({ breed_id, name, designation, pen_name, current_headcount })
updateFlock(id, payload)
deleteFlock(id)

createFeedType(userId, payload)
updateFeedType(id, payload)
deleteFeedType(id)

createFeedAssignment({ flock_id, feed_type_id })
deleteFeedAssignment(id)

getAllBreedsGrouped(userId)   -- returns [{ id, name, class_type, animal_types: [{ id, name, emoji, breeds: [...] }] }]
getFullHierarchy(userId)     -- returns 3-level: classes → types → breeds → flocks (manual waterfall queries)
getOnboardingSummary(userId) -- returns { animal_classes: hierarchy, feed_types }
```

### `src/services/flocksApi.js` — flock detail + history
- `getFlocks()` — parallel: flock+breeds join, all feeding_events; aggregates stats in JS
- `getFlockDetail(flockId)` — parallel: flock detail, feeding history, production logs, casualties
- `getFeedingHistory(flockId, { start_date, end_date, page, per_page })`
- `getProductionHistory(flockId, { start_date, end_date, page, per_page })`
- `logProduction(flockId, payload)` — writes to `production_logs`
- `logCasualty(flockId, payload)` — writes to `casualty_logs`; headcount updated by Postgres trigger

**Key join string:**
```js
`breeds ( name, animal_types ( name, emoji, produces_eggs, produces_milk,
  produces_meat, produces_young, working_animal,
  animal_classes ( name, class_type ) ) )`
```

### `src/services/dashboardApi.js`
- `getDashboardOverview()` — 8 parallel queries; derives fed/pending per flock, feed stock status, alerts
- `dismissInventoryAlert(alertId)`

### `src/services/scaleHouseApi.js`
- Scale house feeding workflow; same join string as flocksApi
- `getQueue(userId)` — returns flat flock objects with `class_type`, `breed_name`, `assigned_feeds[]` already denormalized
- `logSession({ user_id, flock_id, date, headcount_change, casualty_notes, feeding, production })` — writes feeding_events + production_logs in one call

### `src/services/revenueApi.js`
- `getYoungSales(startDate, endDate)` — **dead code, not called anywhere but exists**
- `getFlockYoungSales(flockId)` — used in FlockDetail
- `logYoungSale(payload)` — payload includes `young_term` field (maps to `young_sales.young_term` column)
- `deleteYoungSale(id)`
- Join string updated Sprint 3: `breeds ( name, animal_types ( name, animal_classes ( name, class_type ) ) )`

### `src/services/inventoryApi.js`, `financialsApi.js`, `daySessionApi.js`
- Not reviewed in Sprint 3; may still have old join patterns if they join through breeds.

### `src/services/usersApi.js`
- `getProfileBySupabaseUid(supabaseUid)` — queries `public.users` table
- `createProfileForAuthUser(payload)`
- `updateUser(userId, payload)`
- `updateUserPreferences(userId, payload)`

---

## 4. Frontend Pages

### `/` → Dashboard (`src/pages/dashboard/Dashboard.jsx`)
- Calls `getDashboardOverview(userId)`, polls every 60s
- Shows: feeding progress, today's feed cost, eggs, P&L, feed stock bars, alerts
- `hasEggProduction` driven by `f.produces_eggs` (flat field from service)
- Animal emoji via `getAnimalEmoji(flock)` — reads `flock.emoji` (flat, pre-mapped by dashboardApi)

---

### `/flocks` → FlockList (`src/pages/flocks/FlockList.jsx`)
- Lists flocks with stat cards, Add Flock modal with `BreedSelector`
- Stats cells conditional on `flock.produces_eggs` / `flock.produces_young` / `flock.working_animal`

---

### `/flocks/:id` → FlockDetail (`src/pages/flocks/FlockDetail.jsx`)

**Hook usage:**
```js
import { useAnimalClass } from "../../hooks/useAnimalClass";
const animalClass = useAnimalClass(flock);  // reads flock.breeds.animal_types flags
```

**Production conditionals (lines 27–28):**
```js
const showProduction = Boolean(flock && animalClass.producesEggs && !animalClass.workingAnimal);
const showWorking    = Boolean(flock && animalClass.workingAnimal);
```
Note: `showProduction` gates only on `producesEggs`. Milk-producing animals without eggs get the milk placeholder panel but NOT the "Log Production" button.

**Action buttons in header:**
- `showProduction` → "Log Production" button (eggs only)
- `animalClass.litterTracking` → "Log Litter" button
- `animalClass.producesYoung` → "Sell {youngTerm}" button
- Always → "Log Headcount Change", "Start Feeding"

**Sections rendered:**
| Section | Condition | Source |
|---|---|---|
| Recent Feedings | always | `detail.recent_feedings` |
| Production (egg table) | `showProduction` | `detail.recent_production` |
| Litter History | `animalClass.litterTracking` | `production_logs WHERE litter_count IS NOT NULL` |
| Young Sales | `animalClass.producesYoung && youngSales.length > 0` | `young_sales` via `getFlockYoungSales` |
| Milk Production | `animalClass.producesMilk && !showWorking` | Placeholder — "coming soon" |
| Working Animal | `showWorking` | Static message |
| Headcount History | always | `detail.casualty_history` |

**Modals:**
- `modal === "production"` → `ProductionModal` — logs `egg_count`, `water_consumed`, `notes` via `logProduction`
- `modal === "litter"` → `HeadcountModal` with `additionOnly` — calls `logCasualty` (writes to `casualty_logs`)
- `modal === "young_sale"` → `YoungSaleModal` — calls `logYoungSale` (writes to `young_sales`)
- `modal === "casualty"` → `HeadcountModal` — calls `logCasualty`

**⚠ KNOWN BUG — Litter logging is disconnected from Litter History:**
"Log Litter" opens `HeadcountModal` → calls `logCasualty` → writes to `casualty_logs`.  
Litter History table reads from `production_logs WHERE litter_count IS NOT NULL`.  
These never touch the same table. Litter logged from the FlockDetail button will NEVER appear in the Litter History table. The only path that writes `litter_count` to `production_logs` is the Scale House session form.  
**Fix needed:** Change `modal === "litter"` to open a proper litter modal that calls `logProduction` with `{ litter_count, litter_size, litter_notes }` fields.

---

### `/scale-house` → ScaleHouse (`src/pages/scale-house/ScaleHouse.jsx`)

**Hook usage:**
ScaleHouse does NOT use `useAnimalClass`. It uses `getClassConfig` directly:
```js
const currentAnimalClass = getClassConfig(currentFlock?.class_type || 'other');
```
This is correct — `currentFlock` from `getQueue()` is flat data with `class_type` already denormalized; there is no nested breed structure to traverse.

**Production flag derivation (lines 147–152):**
```js
const showEggs    = currentFlock && currentAnimalClass.producesEggs   && !productionSkipped;
const showLitter  = currentFlock && currentAnimalClass.litterTracking && !productionSkipped;
const showMilk    = currentFlock && currentAnimalClass.producesMilk;
const showWorking = currentFlock && (currentFlock.working_animal || currentAnimalClass.workingAnimal);
const showProduction = showEggs || showLitter || showMilk || showWorking;
```

**Production sections in `ScaleEntryCard` (all confirmed present):**
| Section | Condition | What it renders |
|---|---|---|
| Egg Collection | `showEggs` | +/- counter, water (gal) input, "Skip production data" link |
| Litter / {youngTerm} | `showLitter` | "Births Today?" checkbox; if checked: litter count + size inputs, notes |
| Milk Production | `showMilk` | Placeholder: "🥛 Milk tracking coming soon" |
| Working Animal | `showWorking` | "🛡️ Guardian" message + water consumed input |

**What `logSession` sends for production:**
```js
production: productionSkipped
  ? { egg_count: null, water_consumed: null, notes: sessionNotes || null }
  : {
      egg_count:    safeId(eggCount),
      water_consumed: waterConsumed === "" ? null : Number(waterConsumed),
      litter_count:   litterCount === "" ? null : Number(litterCount),
      litter_size:    litterSize === "" ? null : Number(litterSize),
      litter_notes:   litterNotes || null,
      notes:          sessionNotes || null,
    }
```
This is the ONLY path that writes `litter_count` to `production_logs`.

**Modes:**
- `?mode=daily` — queue-driven; progress bar, "Complete & Next" flow
- `?mode=quick` — flock dropdown; single submit

**Panels:**
- ReviewPanel — date-selectable, per-flock breakdown of feedings + production + casualties
- EditPanel — edits `feeding_events` via `FeedingEditForm`; edits `production_logs` via `ProductionEditForm`

**⚠ KNOWN GAP — `ProductionEditForm` does not support litter fields:**
`ProductionEditForm` (in EditPanel) only exposes `egg_count`, `water_consumed`, `notes`. No `litter_count`, `litter_size`, `litter_notes` fields. Litter data logged via Scale House cannot be corrected from the Edit Panel.

---

### `/onboarding` → OnboardingWizard (`src/pages/onboarding/OnboardingWizard.jsx`)

**Steps (5 total):**
```js
const STEPS = ["Animals", "Breeds", "Groups", "Feed Setup", "Review"];
```

| Step | What it does |
|---|---|
| 1 — Animals | Species grid picker across all SPECIES_MAP entries; `saveStep1` creates animal_classes + animal_types |
| 2 — Breeds | Breed entry per animal_type; `blankBreed(animalTypeId)` uses `animal_type_id` FK |
| 3 — Groups | Flock creation per breed; `blankFlock(breedId)` uses `breed_id` FK |
| 4 — Feed Setup | Feed types + feed assignments |
| 5 — Review | Summary display |

**`saveStep1` flow:**
Loops selected species grouped by `class_type` → calls `createAnimalClass` then `createAnimalType(savedClass.id, { name, species, emoji, ...flags })` for each → stores result in `animalTypes` state as full `animal_types` DB row with `animal_class_id` attached.

**State shapes:**
```js
// breeds state — each entry:
{ tempId, id: null, animal_type_id: animalTypeId, name: "" }

// flocks state — each entry:
{ tempId, id: null, breed_id: breedId, name: "", pen_name: "", current_headcount: 0, designation: "mixed" }
```

**No poultry-specific sub-step:** Step 1 picks all species at once from a flat grid. There is no separate step to select species within a class.

**Re-running Step 1 creates duplicates** (by design — truncate animal data before re-onboarding).

---

### `/farm-setup` → FarmSetup (`src/pages/settings/FarmSetup.jsx`)

**Structure:** 3-level accordion: animal_classes → animal_types → breeds (→ flocks shown read-only).

**What exists per level:**
- **animal_class level:** Edit name/class_type, delete (guarded by animal_types count)
- **animal_type level:** Shows emoji + name, delete (guarded by breed count). No production flag toggles — flags are set at onboarding and not editable from UI post-onboard.
- **breed level:** Add new breed per animal_type (keyed by `animalTypeId` in `newBreedName` state), edit breed name inline, delete breed (guarded by flock count)

**Key handler signatures:**
```js
handleAddBreed(animalTypeId)        // creates breed under specific animal_type
saveBreedEdit(breedId)              // updates breed name
handleDeleteBreed(breedId, breedName)
deleteItem('animalType', id)        // calls deleteAnimalType
deleteItem('animalClass', id)       // calls deleteAnimalClass
```

**Data loaded via:** `getOnboardingSummary(userId)` → returns `{ animal_classes: hierarchy, feed_types }` where hierarchy is full 3-level nesting.

---

### `/inventory` → Inventory | `/finances` → Financials | `/reports` → Export
- Not changed in Sprint 3; may need join string audit if they query through breeds.

---

## 5. Key Utilities

### `src/utils/animalClass.js`
```js
SPECIES_MAP        // 10 species: duck, chicken, turkey, quail, pig, goat, cattle, rabbit, guardian, other
CLASS_CONFIG       // 7 class types with: groupTerm, headTerm, youngTerm, designations[],
                   //   producesEggs, producesMilk, litterTracking, producesYoung, workingAnimal
getClassConfig(classType)           // → CLASS_CONFIG entry (safe fallback to 'other')
getFlockClassType(flock)            // reads flock.breeds.animal_types.animal_classes.class_type
getAnimalEmoji(flock)               // reads flock.breeds.animal_types.emoji → flock.emoji fallback
getProductionFlags(flock)           // reads flock.breeds.animal_types flags → flat flock fallbacks
buildAnimalTypePayload(classId, {}) // builds insert payload for animal_types table
```

### `src/hooks/useAnimalClass.js`
```js
// Wraps getProductionFlags(flock) — used in FlockDetail and FlockList
const animalClass = useAnimalClass(flock);
// Returns: { producesEggs, producesMilk, litterTracking, producesYoung, workingAnimal,
//            groupTerm, headTerm, youngTerm, emoji, ... }
```

### `src/components/BreedSelector.jsx`
- Dropdown for picking a breed when creating a flock
- Loads via `getAllBreedsGrouped(userId)` — 3-level grouped display
- Inline add breed per animal_type via `createBreed(animalTypeId, name)`
- `handleInlineAddBreed(animalTypeId)` updates nested `groups` state

### `src/components/CustomSpeciesForm.jsx`
- Adds a custom species: calls `createAnimalClass` then `createAnimalType`
- Has production flag toggles (eggs, milk, meat, young, working)
- `working_animal = true` forces `produces_meat = false`

---

## 6. Context / Auth

### `src/context/AuthContext.jsx`
- Supabase auth session → loads `profile` from `public.users` via `getProfileBySupabaseUid`
- `profile.id` = integer user ID used everywhere
- `profile.farm_name` = farm name
- Exposes: `user`, `profile`, `loading`, `isOnboarded`, `signIn`, `signUp`, `signOut`, `markOnboarded`, `refreshProfile`

### `src/context/FarmContext.jsx`
- Reads `profile.id` → exposes `userId` (integer) and `farmName`
- Persists both to `localStorage` (keys: `Flock_user_id`, `Flock_farm_name`)

---

## 7. Known Bugs

### BUG-1 — FlockDetail "Log Litter" writes to wrong table
**File:** `src/pages/flocks/FlockDetail.jsx`  
**Symptom:** Litter History table is always empty when litter is logged from the FlockDetail page.  
**Cause:** `modal === "litter"` opens `HeadcountModal` → calls `logCasualty` → writes to `casualty_logs`. The Litter History section queries `production_logs WHERE litter_count IS NOT NULL`. These are different tables.  
**The only thing that populates Litter History** is the Scale House session (`logSession` → writes `litter_count` to `production_logs`).  
**Fix:** Replace the "litter" modal with a dedicated litter form that calls `logProduction({ date, litter_count, litter_size, litter_notes })`.

### BUG-2 — ScaleHouse EditPanel cannot edit litter data
**File:** `src/pages/scale-house/ScaleHouse.jsx` — `ProductionEditForm` component  
**Symptom:** When editing a past session via the Edit Panel, `ProductionEditForm` only shows `egg_count`, `water_consumed`, `notes`. No way to correct `litter_count`, `litter_size`, or `litter_notes`.  
**Fix:** Add litter fields to `ProductionEditForm`, conditionally shown based on the flock's class config.

---

## 8. What Needs Attention (unreviewed areas)

1. **`src/services/inventoryApi.js`** — if it joins through `breeds`, needs the new path via `animal_types`
2. **`src/services/financialsApi.js`** — same concern
3. **`src/services/daySessionApi.js`** — same concern
4. **`src/pages/finances/Financials.jsx`** — UI logic for revenue/expense tracking; not audited
5. **`src/pages/reports/Export.jsx`** — export logic; not reviewed
6. **`young_sales.young_term` column** — referenced in `logYoungSale` payload and confirmed in `revenueApi.js`; verify the column exists in the live DB schema
7. **Postgres trigger on `flocks`** — `logCasualty` says "headcount updated by Postgres trigger"; this trigger was NOT part of the Sprint 3 migration. Verify it still exists.
8. **`alembic_version` table** — legacy Flask migration table, should be ignored but present in DB

---

## 9. Supabase Join Strings — Canonical Forms

Use these exact strings when querying across the hierarchy:

```js
// Flock with full breed → type → class chain
`id, name, designation, pen_name, current_headcount,
 breeds ( name, animal_types ( name, emoji,
   produces_eggs, produces_milk, produces_meat, produces_young, working_animal,
   animal_classes ( name, class_type ) ) )`

// Minimal flock with emoji + class_type only
`id, name, breeds ( name, animal_types ( name, emoji, animal_classes ( class_type ) ) )`

// Breeds grouped (for BreedSelector / getAllBreedsGrouped)
// Queried from animal_classes downward:
`id, name, class_type,
 animal_types ( id, name, emoji, breeds ( id, name ) )`
```

**Flat field mapping from service layer:**
```js
class_type:     flock.breeds?.animal_types?.animal_classes?.class_type || 'other'
emoji:          flock.breeds?.animal_types?.emoji || '🐾'
produces_eggs:  flock.breeds?.animal_types?.produces_eggs ?? false
produces_milk:  flock.breeds?.animal_types?.produces_milk ?? false
produces_meat:  flock.breeds?.animal_types?.produces_meat ?? true
produces_young: flock.breeds?.animal_types?.produces_young ?? true
working_animal: flock.breeds?.animal_types?.working_animal ?? false
```

---

## 10. Sprint Status

| Sprint | Status | Key deliverables |
|---|---|---|
| 0 | ✅ Done | Supabase client, auth, routing, DaisyUI theme |
| 1 | ✅ Done | Dashboard, FlockList, FlockDetail, Scale House |
| 2 | ✅ Done | Inventory, Financials, Feed tracking |
| 3 | ✅ Done | 3-level hierarchy DB migration, OnboardingWizard rewrite, FarmSetup rewrite, RLS policies fixed |
| 4 | Next | — |
