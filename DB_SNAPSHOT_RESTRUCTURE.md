# FarmBright — DB Snapshot & Rollback Reference
# Sprint 3 baseline — branch: sprint-3-db

**Created:** 2026-06-07
**Purpose:** Capture the exact state of all Supabase tables, triggers, RLS policies, RPCs, and frontend query patterns before Sprint 3 DB changes. Use this to restore if anything breaks.

---

## HOW TO USE THIS DOCUMENT

If a DB change breaks the app, use this as the authoritative reference for:
1. What the schema looked like before
2. Exactly which columns each frontend query expects
3. The full SQL to re-run to restore triggers/policies/RPCs
4. The frontend service files and what table/column names they reference

To restore: paste the relevant SQL sections into the Supabase SQL editor and re-run. All statements use `CREATE OR REPLACE` or `DROP ... CREATE` so they are safe to re-run.

---

## SECTION 1 — SUPABASE CLIENT CONFIG

**File:** `farmbright/src/services/supabaseClient.js`

```js
import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(
  rawSupabaseUrl &&
    rawSupabaseKey &&
    !rawSupabaseUrl.includes("<user will fill in>") &&
    !rawSupabaseKey.includes("<user will fill in>")
);

export const supabase = createClient(
  isSupabaseConfigured ? rawSupabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? rawSupabaseKey : "placeholder-anon-key",
  {
    auth: {
      storageKey: "flock-auth-token",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
```

**Required `.env` variables:**
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_KEY=<anon-public-key>
```

**Auth URL Configuration (set in Supabase Dashboard → Auth → URL Config):**
- Site URL: `https://flocked.netlify.app`
- Redirect URLs: `http://localhost:5173/reset-password` and `https://flocked.netlify.app/reset-password`

---

## SECTION 2 — TABLE SCHEMA (columns the frontend uses)

### `public.users`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | Internal PK. All farm tables reference this. |
| `supabase_uid` | uuid | FK → `auth.users.id`. RLS bridge. |
| `email` | text | Kept in sync when auth email changes. |
| `farm_name` | text | |
| `display_name` | text | Nullable. |
| `preferences` | jsonb | `{ low_feed_alerts, email_alerts, daily_summary_email, time_zone }` |

### `public.animal_classes`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | |
| `user_id` | integer | FK → `users.id` |
| `name` | text | e.g. "Chicken", "Duck" |

### `public.breeds`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | |
| `animal_class_id` | integer | FK → `animal_classes.id` |
| `name` | text | |

### `public.flocks`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | |
| `breed_id` | integer | FK → `breeds.id` |
| `name` | text | |
| `current_headcount` | integer | Updated by `casualty_log_apply_headcount` trigger. |
| `designation` | text | `layer` \| `breeder` \| `meat` \| `mixed` |
| `pen_name` | text | Nullable. |

### `public.feed_types`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | |
| `user_id` | integer | FK → `users.id` |
| `name` | text | |
| `unit` | text | e.g. `lbs` |
| `current_on_hand` | float | Debited/credited by triggers and RPCs. |
| `par_level` | float | Low-stock threshold. |
| `bag_weight` | float | |
| `bag_price` | float | |
| `cost_per_unit` | float | Auto-synced: `bag_price / bag_weight` (trigger). |

### `public.feed_assignments`
| Column | Type |
|---|---|
| `flock_id` | integer |
| `feed_type_id` | integer |

### `public.feeding_events`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | |
| `flock_id` | integer | |
| `feed_type_id` | integer | |
| `date` | date | |
| `timestamp` | timestamptz | |
| `total_weight` | float | Lbs used. |
| `weight_per_bird` | float | |
| `cost_total` | float | |
| `cost_per_bird` | float | |
| `cost_per_lb_at_time` | float | Locked at insert time by trigger. |
| `input_method` | text | `manual` \| `scale` |

### `public.production_logs`
| Column | Type |
|---|---|
| `id` | integer |
| `flock_id` | integer |
| `date` | date |
| `egg_count` | integer |
| `water_consumed` | float |
| `notes` | text |

### `public.casualty_logs`
| Column | Type | Notes |
|---|---|---|
| `id` | integer | |
| `flock_id` | integer | |
| `date` | date | |
| `change_amount` | integer | Negative = casualties, positive = additions. |
| `notes` | text | |

### `public.inventory_transactions`
| Column | Type |
|---|---|
| `id` | integer |
| `feed_type_id` | integer |
| `date` | date |
| `transaction_type` | text (`purchase` \| `feeding` \| `adjustment`) |
| `quantity_change` | float |
| `unit_cost` | float |
| `bag_weight` | float |
| `bag_price` | float |
| `cost_per_lb` | float |
| `notes` | text |

### `public.alerts`
| Column | Type |
|---|---|
| `id` | integer |
| `user_id` | integer |
| `feed_type_id` | integer |
| `alert_type` | text (`low_feed`) |
| `message` | text |
| `is_read` | boolean |

### `public.revenues`
| Column | Type |
|---|---|
| `id` | integer |
| `user_id` | integer |
| `flock_id` | integer (nullable) |
| `amount` | float |
| `date` | date |

### `public.breeding_logs` / `public.financial_records`
RLS enabled. No frontend queries exist against these tables. Schema not audited.

---

## SECTION 3 — POSTGRES FUNCTIONS & TRIGGERS (full SQL)

### Migration 1: Auth Bridge
**File:** `farmbright/supabase/migrations/20260606025334_auth_user_profile_bridge.sql`

Key elements:
- Ensures `public.users.supabase_uid` is `uuid` type
- Adds FK: `public.users.supabase_uid → auth.users.id ON DELETE CASCADE`
- `public.handle_new_auth_user()` — trigger function, creates `public.users` row on new Supabase Auth signup
- Trigger `on_auth_user_created` — AFTER INSERT ON `auth.users`
- `public.current_app_user_id()` — maps `auth.uid()` → `public.users.id` (used by all RLS policies)

**To restore:** Re-run the full SQL file in Supabase SQL editor.

---

### Migration 2: RLS, Triggers, RPCs
**File:** `farmbright/supabase/migrations/20260606120000_rls_and_triggers.sql`

#### Postgres Functions to restore:

| Function | Purpose |
|---|---|
| `public.user_owns_flock(int)` | Returns true if `auth.uid()` → user owns the flock |
| `public.user_owns_breed(int)` | Returns true if `auth.uid()` → user owns the breed |
| `public.sync_feed_cost_per_unit()` | Trigger fn: sets `cost_per_unit = bag_price / bag_weight` |
| `public.apply_casualty_headcount_change()` | Trigger fn: updates `flocks.current_headcount` |
| `public.lock_feeding_event_cost()` | Trigger fn: locks `cost_per_lb_at_time` at insert |
| `public.debit_feed_on_feeding_event()` | Trigger fn: debits inventory, inserts transaction, creates alert |
| `public.restore_feed_on_feeding_event_delete()` | Trigger fn: restores inventory on delete |
| `public.adjust_feed_on_feeding_event_update()` | Trigger fn: restores old / debits new on update |
| `public.purchase_feed(...)` | RPC: atomic purchase + transaction + clear alerts |
| `public.adjust_feed(...)` | RPC: atomic inventory adjustment + transaction |

#### Triggers to restore:

| Trigger name | Table | Event | Fires when |
|---|---|---|---|
| `feed_types_sync_cost` | `feed_types` | BEFORE INSERT/UPDATE | `bag_weight` or `bag_price` changes |
| `casualty_log_apply_headcount` | `casualty_logs` | AFTER INSERT | Any new casualty log |
| `feeding_event_lock_cost` | `feeding_events` | BEFORE INSERT | Any new feeding event |
| `feeding_event_debit_inventory` | `feeding_events` | AFTER INSERT | Any new feeding event |
| `feeding_event_restore_on_delete` | `feeding_events` | BEFORE DELETE | Any feeding event delete |
| `feeding_event_adjust_inventory` | `feeding_events` | BEFORE UPDATE | When `total_weight` or `feed_type_id` changes |

#### RLS Policies to restore:

| Table | Policy name | Logic |
|---|---|---|
| `users` | `users_own` | `id = current_app_user_id()` |
| `animal_classes` | `animal_classes_own` | `user_id = current_app_user_id()` |
| `breeds` | `breeds_select_update_delete` + `breeds_update` + `breeds_delete` + `breeds_insert` | Via `user_owns_breed(id)` / parent animal_class check |
| `flocks` | `flocks_select_update_delete` + `flocks_update` + `flocks_delete` + `flocks_insert` | Via `user_owns_flock(id)` / parent breed check |
| `feed_types` | `feed_types_own` | `user_id = current_app_user_id()` |
| `feed_assignments` | `feed_assignments_select_delete` + `feed_assignments_insert` | Via `user_owns_flock(flock_id)` + owned feed_type |
| `feeding_events` | `feeding_events_select_delete` + `feeding_events_update` + `feeding_events_delete` + `feeding_events_insert` | Via `user_owns_flock(flock_id)` |
| `production_logs` | `production_logs_select/insert/delete` | Via `user_owns_flock(flock_id)` |
| `casualty_logs` | `casualty_logs_select/insert/delete` | Via `user_owns_flock(flock_id)` |
| `breeding_logs` | `breeding_logs_own` | Via `user_owns_flock(flock_id)` |
| `inventory_transactions` | `inventory_transactions_select/insert` | Via owned `feed_type_id` |
| `alerts` | `alerts_own` | `user_id = current_app_user_id()` |
| `revenues` | `revenues_own` | `user_id = current_app_user_id()` |
| `financial_records` | `financial_records_own` | Via `user_owns_flock(flock_id)` |

**To restore all triggers, RPCs, and RLS policies:** Re-run `20260606120000_rls_and_triggers.sql` in full. All statements are idempotent (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, `DROP POLICY IF EXISTS`).

---

## SECTION 4 — FRONTEND QUERY MAP

Every table + column name the frontend currently queries. If you rename/remove any of these in the DB, the corresponding frontend call will break.

### `usersApi.js`
```
TABLE: public.users
SELECT: supabase_uid, id, email, farm_name, display_name, preferences
INSERT: supabase_uid, email, farm_name, display_name
UPDATE: display_name, farm_name, preferences (by id)
FILTER: .eq('supabase_uid', uid)
```

### `dashboardApi.js`
```
TABLE: flocks
SELECT: id, name, designation, current_headcount,
        breeds(name, animal_classes(name)),
        feed_assignments(feed_types(name))
FILTER: (no user filter — RLS scopes it)

TABLE: feed_types
SELECT: name, current_on_hand, par_level, unit, id, bag_weight, bag_price, cost_per_unit

TABLE: feeding_events (today)
SELECT: flock_id, total_weight, cost_per_lb_at_time, timestamp
FILTER: .gte('timestamp', startOfToday) .lt('timestamp', startOfTomorrow)

TABLE: feeding_events (yesterday)
SELECT: flock_id, total_weight, cost_per_lb_at_time
FILTER: .gte('timestamp', startOfYesterday) .lt('timestamp', startOfToday)

TABLE: production_logs (today)
SELECT: flock_id, egg_count
FILTER: .eq('date', today)

TABLE: production_logs (yesterday)
SELECT: egg_count
FILTER: .eq('date', yesterday)

TABLE: revenues (today, yesterday)
SELECT: amount
FILTER: .eq('date', today or yesterday)

TABLE: alerts
SELECT: id, feed_type_id, alert_type, is_read, feed_types(name, current_on_hand, par_level, unit)
FILTER: .eq('is_read', false)
UPDATE: is_read = true (dismiss)
```

### `flocksApi.js`
```
TABLE: flocks
SELECT: id, name, designation, current_headcount, pen_name,
        breeds(name, animal_classes(name)),
        feed_assignments(feed_types(id, name, unit, cost_per_unit))
INSERT: breed_id, name, designation, current_headcount, pen_name
DELETE: by id

TABLE: feeding_events (in getFlockDetail)
SELECT: id, date, timestamp, total_weight, weight_per_bird, cost_total, cost_per_bird, input_method,
        feed_types(name)
FILTER: .eq('flock_id', id) .order('timestamp', desc) .limit(30)

TABLE: production_logs
SELECT: id, date, egg_count, water_consumed, notes
INSERT: flock_id, date, egg_count, water_consumed, notes
FILTER: .eq('flock_id', id) .order('date', desc) .limit(30)

TABLE: casualty_logs
SELECT: id, date, change_amount, notes
INSERT: flock_id, date, change_amount, notes
FILTER: .eq('flock_id', id) .order('date', desc) .limit(30)
```

### `inventoryApi.js`
```
TABLE: feed_types
SELECT: id, name, unit, current_on_hand, par_level, bag_weight, bag_price, cost_per_unit, user_id
INSERT: user_id, name, unit, current_on_hand, par_level, bag_weight, bag_price
UPDATE: name, unit, par_level, bag_weight, bag_price (by id)
DELETE: by id

TABLE: alerts
SELECT: id, feed_type_id, alert_type, message, is_read
UPDATE: is_read = true

TABLE: inventory_transactions
SELECT: id, date, transaction_type, quantity_change, unit_cost, bag_weight, bag_price, cost_per_lb, notes
FILTER: .eq('feed_type_id', id) .order('date', desc)

RPC: purchase_feed(p_feed_type_id, p_num_bags, p_bag_weight, p_bag_price, p_date, p_supplier)
RPC: adjust_feed(p_feed_type_id, p_quantity_change, p_reason, p_date)
```

### `onboardingApi.js`
```
TABLE: animal_classes
SELECT: id, name, user_id
INSERT: user_id, name
UPDATE: name (by id)
DELETE: by id

TABLE: breeds
SELECT: id, name, animal_class_id, animal_classes(name)
INSERT: animal_class_id, name
UPDATE: name (by id)
DELETE: by id

TABLE: flocks
SELECT: id, name, designation, current_headcount, pen_name, breed_id,
        breeds(name, animal_classes(name)),
        feed_assignments(feed_types(id, name))
INSERT: breed_id, name, designation, current_headcount, pen_name
UPDATE: name, designation, current_headcount, pen_name, breed_id (by id)
DELETE: by id

TABLE: feed_types
SELECT: id, name, unit, current_on_hand, par_level, bag_weight, bag_price, cost_per_unit
INSERT: user_id, name, unit, current_on_hand, par_level, bag_weight, bag_price
UPDATE: name, unit, par_level, bag_weight, bag_price (by id)
DELETE: by id

TABLE: feed_assignments
INSERT: flock_id, feed_type_id
DELETE: .eq('flock_id').eq('feed_type_id')
```

### `scaleHouseApi.js`
```
TABLE: flocks (getQueue)
SELECT: id as flock_id, name, designation, current_headcount, pen_name,
        breeds(name, animal_classes(name)),
        feed_assignments(feed_types(id as feed_type_id, name, unit, current_on_hand, cost_per_unit, bag_price, bag_weight))

TABLE: feeding_events (getQueue — checks fed_today)
SELECT: flock_id
FILTER: .eq('date', today)

TABLE: feeding_events (getTodayEvents)
SELECT: id, flock_id, timestamp, total_weight, weight_per_bird,
        cost_total, cost_per_bird, input_method,
        feed_types(name as feed_name), flocks(name as flock_name)
FILTER: .eq('date', today)

TABLE: feeding_events (logSession — INSERT)
INSERT: flock_id, feed_type_id, date, total_weight, weight_per_bird,
        cost_total, cost_per_bird, input_method

TABLE: production_logs (logSession — INSERT)
INSERT: flock_id, date, egg_count, water_consumed, notes

TABLE: casualty_logs (logSession — INSERT)
INSERT: flock_id, date, change_amount, notes

TABLE: feeding_events (deleteEvent)
DELETE: .eq('id', eventId)

TABLE: feeding_events (patchEvent)
UPDATE: total_weight, weight_per_bird, cost_total, cost_per_bird (by id)
```

### `daySessionApi.js`
```
TABLE: feeding_events (getTodaySession)
SELECT: id, flock_id, date, timestamp,
        total_weight, weight_per_bird, cost_total, cost_per_bird, input_method,
        feed_types(id, name, unit, cost_per_unit),
        flocks(id, name, current_headcount, breeds(name, animal_classes(name)))
FILTER: .eq('date', sessionDate)

TABLE: production_logs (getTodaySession)
SELECT: id, flock_id, date, egg_count, water_consumed, notes, flocks(name)
FILTER: .eq('date', sessionDate)

TABLE: casualty_logs (getTodaySession)
SELECT: id, flock_id, date, change_amount, notes, flocks(name)
FILTER: .eq('date', sessionDate)

TABLE: feeding_events (updateFeedingEvent)
UPDATE: total_weight, feed_type_id, weight_per_bird, cost_total, cost_per_bird, input_method (by id)
NOTE: Postgres trigger handles inventory side effects on UPDATE

TABLE: feeding_events (deleteFeedingEvent)
DELETE: .eq('id', eventId)
NOTE: Postgres trigger restores inventory on DELETE

TABLE: production_logs (updateProductionLog)
UPDATE: egg_count, water_consumed, notes (by id)

TABLE: feeding_events (deleteAllTodayFeedings)
DELETE: .eq('date', date)
NOTE: Trigger fires per-row to restore inventory for each deleted event
```

### `financialsApi.js`
```
TABLE: feeding_events
SELECT: total_weight, cost_per_lb_at_time, cost_total (aggregated)
FILTER: date range

TABLE: production_logs
SELECT: egg_count (aggregated)
FILTER: date range

TABLE: revenues
SELECT: id, amount, date, flock_id, flocks(name)
INSERT: user_id, amount, date, flock_id (optional)

TABLE: flocks
SELECT: id, name (for flock-level P&L)
```

### `exportApi.js`
```
TABLE: feeding_events
SELECT: date, flock_id, feed_type_id, total_weight, weight_per_bird, cost_total, cost_per_bird,
        input_method, flocks(name), feed_types(name)
FILTER: date range, optional flock filter

TABLE: production_logs
SELECT: date, flock_id, egg_count, water_consumed, notes, flocks(name)
FILTER: date range

TABLE: feed_types
SELECT: name, current_on_hand, par_level, unit, cost_per_unit

TABLE: revenues (financial export)
SELECT: date, amount, flock_id, flocks(name)
```

### `authContext` (direct supabase.auth calls)
```
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signUp({ email, password, options: { data: { farm_name } } })
supabase.auth.signOut()
supabase.auth.onAuthStateChange(callback)  → events: SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, TOKEN_REFRESHED
supabase.auth.updateUser({ password })     → changes password
supabase.auth.updateUser({ email })        → initiates email change (sends confirmation)
supabase.auth.resetPasswordForEmail(email, { redirectTo })  → sends reset link
supabase.auth.getSession()
```

---

## SECTION 5 — CRITICAL DEPENDENCIES

These are the things most likely to break if the DB schema changes:

### If you rename a column:
| Column | Used in | What breaks |
|---|---|---|
| `feeding_events.total_weight` | scaleHouseApi, daySessionApi, dashboardApi, flocksApi, exportApi | Every feed log |
| `feeding_events.cost_per_lb_at_time` | scaleHouseApi, dashboardApi, exportApi | Cost calculations |
| `flocks.current_headcount` | scaleHouseApi, flocksApi, onboardingApi, daySessionApi | Headcount display |
| `flocks.designation` | dashboard, flocks, scale-house (show/hide production) | Production section visibility |
| `feed_types.cost_per_unit` | scaleHouseApi (cost calc), daySessionApi (edit panel) | All cost math |
| `feed_types.current_on_hand` | inventoryApi, dashboardApi, scaleHouseApi | Stock display and feed remaining |
| `users.supabase_uid` | usersApi, RLS via current_app_user_id() | Entire auth bridge — app unusable |
| `users.id` | Every RLS policy, every join | Entire app |

### If you drop a trigger:
| Trigger | Effect of dropping |
|---|---|
| `feeding_event_lock_cost` | `cost_per_lb_at_time` will be null on new events; cost display breaks |
| `feeding_event_debit_inventory` | Feed inventory never debits when feeding events are created |
| `feeding_event_restore_on_delete` | Inventory never restores when events deleted |
| `feeding_event_adjust_inventory` | Edit panel changes don't update inventory |
| `casualty_log_apply_headcount` | `flocks.current_headcount` never updates when casualties logged |
| `feed_types_sync_cost` | `cost_per_unit` goes stale when bag size/price changes |
| `on_auth_user_created` | New signups don't get a `public.users` row — entire app breaks for new users |

### If you drop a function:
| Function | Effect of dropping |
|---|---|
| `current_app_user_id()` | All RLS policies fail — no data is accessible to any user |
| `user_owns_flock()` | All RLS policies on flocks, events, logs fail |
| `user_owns_breed()` | Breed RLS fails |
| `purchase_feed()` | Inventory purchase RPC breaks |
| `adjust_feed()` | Inventory adjust RPC breaks |

---

## SECTION 6 — HOW TO FULLY RESTORE

If the Sprint 3 DB changes break the app and you need to revert to this baseline:

### Step 1 — Restore triggers and RPCs
Run both migration files in order in the Supabase SQL editor:
1. `farmbright/supabase/migrations/20260606025334_auth_user_profile_bridge.sql`
2. `farmbright/supabase/migrations/20260606120000_rls_and_triggers.sql`

Both are fully idempotent. Safe to re-run without data loss.

### Step 2 — Verify RLS is enabled
In Supabase Dashboard → Table Editor → each table → RLS. If any table shows RLS disabled, run:
```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
```

### Step 3 — Restore frontend code
```bash
git checkout restructure
```
Or if you're on `sprint-3-db` and want to undo all code changes:
```bash
git checkout restructure -- farmbright/src/
```

### Step 4 — Verify build
```bash
cd farmbright && npx vite build
```
Zero errors expected. The chunk-size warning (>500KB) is pre-existing and not a problem.

### Step 5 — Smoke test checklist
- [ ] Can log in with existing account
- [ ] Dashboard loads with flock feed status
- [ ] Scale House daily mode queues flocks correctly
- [ ] Log a feeding event — check inventory debits
- [ ] Delete a feeding event — check inventory restores
- [ ] Inventory page shows correct on-hand values
- [ ] Review panel opens and shows today's session data
- [ ] Edit panel can save a weight change
