# Flock Project Report

Generated: 2026-06-04  
Workspace: `c:\Users\orian\OneDrive\Desktop\FarmApp`  
Project root: `farmbright/`

## 1. Project Structure

Source tree shown below excludes ignored build/runtime artifacts such as `node_modules/`, `dist/`, `__pycache__/`, and database/cache files.

```text
farmbright/
  .gitignore
  README.md
  docker-compose.yml
  backend/
    .env.example
    config.py
    requirements.txt
    app/
      __init__.py
      extensions.py
      models/
        __init__.py
        alert.py
        animal_class.py
        breed.py
        breeding_log.py
        casualty_log.py
        feed_assignment.py
        feed_type.py
        feeding_event.py
        financial_record.py
        flock.py
        inventory_transaction.py
        production_log.py
        revenue.py
        user.py
      routes/
        __init__.py
        dashboard.py
        export.py
        financials.py
        health.py
        inventory.py
        onboarding.py
        scale_house.py
        users.py
      services/
        __init__.py
        export_service.py
        financial_service.py
        scale_service.py
      utils/
        __init__.py
    migrations/
      README
      alembic.ini
      env.py
      script.py.mako
      versions/
        d2c72f65c70a_initial_schema.py
        9f1a3d7c1b2e_add_revenues.py
        4c8b2f6d0a91_feed_cost_per_lb_fix.py
    scripts/
      seed.py
  frontend/
    .env
    index.html
    package.json
    package-lock.json
    postcss.config.js
    tailwind.config.js
    public/
      .gitkeep
    src/
      App.jsx
      index.css
      main.jsx
      router.jsx
      components/
        .gitkeep
        AppLayout.jsx
        ProtectedRoute.jsx
      context/
        AuthContext.jsx
        FarmContext.jsx
      hooks/
        .gitkeep
      pages/
        animals/
          .gitkeep
        auth/
          Login.jsx
        dashboard/
          Dashboard.jsx
        feed/
          .gitkeep
        finances/
          .gitkeep
          Financials.jsx
        inventory/
          Inventory.jsx
        onboarding/
          .gitkeep
          OnboardingWizard.jsx
        production/
          .gitkeep
        reports/
          .gitkeep
          Export.jsx
        scale-house/
          ScaleHouse.jsx
        settings/
          Settings.jsx
      services/
        api.js
        dashboardApi.js
        exportApi.js
        financialsApi.js
        inventoryApi.js
        onboardingApi.js
        scaleHouseApi.js
        usersApi.js
```

## 2. Backend Summary

### App Factory

`backend/app/__init__.py` creates the Flask app, loads `config_by_name`, initializes:

- `db`: Flask-SQLAlchemy
- `migrate`: Flask-Migrate/Alembic
- `login_manager`: Flask-Login
- `mail`: Flask-Mail

Registered blueprints:

- `dashboard_bp`
- `export_bp`
- `financials_bp`
- `health_bp`
- `inventory_bp`
- `onboarding_bp`
- `scale_house_bp`
- `users_bp`

### Config

`backend/config.py`:

- Loads `.env` with `python-dotenv`.
- `BaseConfig`
  - `SECRET_KEY` from env, default `dev-secret-change-me`
  - `SQLALCHEMY_DATABASE_URI` from `DATABASE_URL`, default local Postgres `postgresql://Flock:Flock@localhost:5432/Flock`
  - `SQLALCHEMY_TRACK_MODIFICATIONS = False`
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
- `DevelopmentConfig`: `DEBUG=True`, `ENV=development`
- `ProductionConfig`: `DEBUG=False`, `ENV=production`
- `TestingConfig`: `TESTING=True`, DB from `TEST_DATABASE_URL`

`backend/.env.example` defines:

```text
FLASK_APP=app:create_app
FLASK_ENV=development
SECRET_KEY=replace-me
DATABASE_URL=postgresql://flock:flock@localhost:5432/flock
TEST_DATABASE_URL=postgresql://flock:flock@localhost:5432/flock_test
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-or-anon-key
MAIL_SERVER=smtp.example.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=alerts@example.com
MAIL_PASSWORD=replace-me
```

### Requirements

`backend/requirements.txt`:

- `flask`
- `flask-cors`
- `flask-sqlalchemy`
- `flask-migrate`
- `flask-login`
- `flask-mail`
- `psycopg2-binary`
- `python-dotenv`
- `supabase`
- `hidapi`
- `reportlab`
- `openpyxl`
- `APScheduler`

### Routes

All main API blueprints except `/health` enable CORS for `http://localhost:5173`.

#### Health

`backend/app/routes/health.py`

- `GET /health`
  - Returns `{ status, db, scale, version }`.
  - Checks DB with `SELECT 1`.
  - Checks scale through `detect_scale()`.

#### Users

`backend/app/routes/users.py`, prefix `/api/users`

- `POST /api/users`
  - Creates or returns a backend user mapped to a Supabase user.
  - Required: `supabase_uid`, `email`, `farm_name`.
- `GET /api/users/by-uid/<supabase_uid>`
  - Fetches backend user by Supabase UID.

#### Onboarding

`backend/app/routes/onboarding.py`, prefix `/api/onboarding`

- Animal classes:
  - `POST /animal-class`
  - `PATCH /animal-class/<animal_class_id>`
  - `DELETE /animal-class/<animal_class_id>`
- Breeds:
  - `POST /breed`
  - `PATCH /breed/<breed_id>`
  - `DELETE /breed/<breed_id>`
- Flocks:
  - `POST /flock`
  - `PATCH /flock/<flock_id>`
  - `DELETE /flock/<flock_id>`
- Feed types:
  - `POST /feed-type`
  - `PATCH /feed-type/<feed_type_id>`
  - `DELETE /feed-type/<feed_type_id>`
  - Feed setup now accepts `bag_weight` and `bag_price`; `cost_per_unit` is derived.
- Feed assignments:
  - `POST /feed-assignment`
  - `DELETE /feed-assignment/<assignment_id>`
- Summary:
  - `GET /summary/<user_id>`
  - Returns nested animal class, breed, flock, feed assignment, and feed type setup data.

#### Dashboard

`backend/app/routes/dashboard.py`, prefix `/api/dashboard`

- `GET /overview/<user_id>`
  - Returns farm name, today summary, alerts, yesterday summary, and feed stock status.
  - Computes flocks fed today from `FeedingEvent`.
  - Computes feed cost from `FeedingEvent.cost_total`.
  - Computes egg totals from `ProductionLog`.
  - Feed stock status:
    - `critical`: on hand <= par
    - `warning`: on hand <= par * 2
    - `ok`: on hand > par * 2

#### Inventory

`backend/app/routes/inventory.py`, prefix `/api/inventory`

- `GET /<user_id>`
  - Lists user feed types with inventory status, bag price, bag weight, and cost per lb.
- `GET /feed/<feed_id>/transactions`
  - Returns inventory transactions with computed running balance.
  - Optional query params: `start_date`, `end_date`.
- `POST /purchase`
  - Body: `feed_type_id`, `num_bags`, `bag_weight`, `bag_price`, `date`, `supplier`.
  - Adds `num_bags * bag_weight` to `current_on_hand`.
  - Updates current feed bag price/weight.
  - Writes purchase transaction with locked `cost_per_lb`.
  - Marks unread low-feed alerts for that feed as read.
- `POST /adjustment`
  - Directly adjusts `current_on_hand`.
  - Writes adjustment transaction.
- `GET /alerts/<user_id>`
  - Returns unread low-feed alerts.
- `PATCH /feed/<feed_id>`
  - Updates `name`, `par_level`, `bag_weight`, `bag_price`.
- `DELETE /alert/<alert_id>`
  - Marks alert as read.

#### Scale House

`backend/app/routes/scale_house.py`, prefix `/api/scale-house`

- Scale:
  - `GET /scale/status`
  - `GET /scale/read`
  - `GET /scale/stream`
- Queue:
  - `GET /queue/<user_id>`
  - `GET /queue/<user_id>/summary`
- Feeding sessions:
  - `POST /session`
    - Logs feeding event, optional production log, optional headcount change.
    - Locks `cost_per_lb_at_time`.
    - Feeding event model listener debits feed inventory and writes ledger row.
  - `GET /events/today/<user_id>`
  - `DELETE /event/<event_id>`
    - Restores feed inventory and writes adjustment transaction.
  - `PATCH /event/<event_id>`
    - Restores old feed amount, applies new feed amount, updates locked cost.

#### Financials

`backend/app/routes/financials.py`, prefix `/api/financials`

- `GET /summary/<user_id>`
  - Farm-level feed cost, revenue, net P&L, daily series, top cost flock.
- `GET /flocks/<user_id>`
  - Per-flock P&L summaries.
- `GET /flock/<flock_id>`
  - Per-flock detail.
- `POST /revenue`
  - Creates revenue record.
  - Sources: `egg_sales`, `meat_sales`, `breeding_sales`, `other`.
- `GET /revenue/<user_id>`
  - Revenue history by date range.

#### Export

`backend/app/routes/export.py`, prefix `/api/export`

- `POST /generate`
  - Generates CSV, PDF, or XLSX.
  - Supports report types through export service.
- `GET /preview`
  - Returns preview headers and rows for a report.

### Models

#### User

Table: `users`

- `id`
- `supabase_uid`, unique and indexed
- `email`, unique and indexed
- `farm_name`
- `created_at`

Relationships:

- `animal_classes`
- `feed_types`
- `alerts`
- `revenues`

#### AnimalClass

Table: `animal_classes`

- `id`
- `user_id` FK to `users`
- `name`

Relationships:

- `user`
- `breeds`

#### Breed

Table: `breeds`

- `id`
- `animal_class_id` FK to `animal_classes`
- `name`

Relationships:

- `animal_class`
- `flocks`

#### Flock

Table: `flocks`

- `id`
- `breed_id` FK to `breeds`
- `name`
- `designation`: `layer`, `breeder`, `meat`, `mixed`
- `pen_name`
- `current_headcount`
- `created_at`

Relationships:

- `breed`
- `casualty_logs`
- `feed_assignments`
- `feeding_events`
- `production_logs`
- `breeding_logs`
- `financial_records`
- `revenues`

#### CasualtyLog

Table: `casualty_logs`

- `id`
- `flock_id` FK to `flocks`
- `date`
- `change_amount`
- `notes`
- `created_at`

Behavior:

- `after_insert` listener updates `Flock.current_headcount`.

#### FeedType

Table: `feed_types`

- `id`
- `user_id` FK to `users`
- `name`
- `unit`: `lbs`, `kg`
- `cost_per_unit`
- `bag_weight`
- `bag_price`
- `par_level`
- `current_on_hand`

Relationships:

- `user`
- `feed_assignments`
- `feeding_events`
- `inventory_transactions`
- `alerts`

Behavior:

- `cost_per_lb` hybrid property returns `bag_price / bag_weight`.
- `before_insert` and `before_update` listeners sync `cost_per_unit` to derived `cost_per_lb`.

#### FeedAssignment

Table: `feed_assignments`

- `id`
- `flock_id` FK to `flocks`
- `feed_type_id` FK to `feed_types`

Constraints:

- Unique pair: `flock_id`, `feed_type_id`

Relationships:

- `flock`
- `feed_type`

#### FeedingEvent

Table: `feeding_events`

- `id`
- `flock_id` FK to `flocks`
- `feed_type_id` FK to `feed_types`
- `date`
- `timestamp`
- `total_weight`
- `cost_per_lb_at_time`
- `input_method`: `manual`, `scale`

Hybrid/computed values:

- `weight_per_bird`
- `cost_total`
- `cost_per_bird`

Behavior:

- `before_insert` locks current feed `cost_per_lb`.
- `after_insert` debits feed inventory.
- `after_insert` creates an `InventoryTransaction` of type `feeding`.
- `after_insert` creates a low-feed `Alert` when on hand is at or below par.

#### InventoryTransaction

Table: `inventory_transactions`

- `id`
- `feed_type_id` FK to `feed_types`
- `date`
- `transaction_type`: `purchase`, `feeding`, `adjustment`
- `quantity_change`
- `unit_cost`
- `bag_weight`
- `bag_price`
- `cost_per_lb`
- `notes`

Relationships:

- `feed_type`

#### ProductionLog

Table: `production_logs`

- `id`
- `flock_id` FK to `flocks`
- `date`
- `egg_count`
- `water_consumed`
- `avg_weight`
- `notes`

Relationships:

- `flock`

#### BreedingLog

Table: `breeding_logs`

- `id`
- `flock_id` FK to `flocks`
- `date`
- `male_id` nullable FK to `flocks`
- `female_id` nullable FK to `flocks`
- `outcome_notes`
- `expected_hatch_date`

Relationships:

- `flock`
- `male`
- `female`

#### FinancialRecord

Table: `financial_records`

- `id`
- `flock_id` FK to `flocks`
- `date`
- `total_feed_cost`
- `total_revenue`
- `net_pl`
- `cost_per_bird`
- `revenue_source`: `egg_sales`, `meat_sales`, `other`

Relationships:

- `flock`

Current note:

- Model exists, but the nightly scheduled aggregation job is not implemented yet.

#### Revenue

Table: `revenues`

- `id`
- `user_id` FK to `users`
- `flock_id` nullable FK to `flocks`
- `date`
- `amount`
- `source`: `egg_sales`, `meat_sales`, `breeding_sales`, `other`
- `notes`

Relationships:

- `user`
- `flock`

#### Alert

Table: `alerts`

- `id`
- `user_id` FK to `users`
- `feed_type_id` nullable FK to `feed_types`
- `alert_type`: `low_feed`
- `message`
- `is_read`
- `created_at`

Relationships:

- `user`
- `feed_type`

### Services

#### `scale_service.py`

- Wraps DYMO S400 HID access through `hidapi`.
- Vendor/product IDs:
  - `VENDOR_ID = 0x0922`
  - `PRODUCT_ID = 0x8003`
- Functions:
  - `connect()`
  - `disconnect()`
  - `is_connected()`
  - `get_reading()`
  - `get_stable_reading()`
  - `detect_scale()`
- Handles grams, ounces, and pounds conversion to pounds.

#### `financial_service.py`

- Computes live financial summaries from `FeedingEvent`, `ProductionLog`, and `Revenue`.
- Functions:
  - `get_farm_summary(user_id, start_date, end_date)`
  - `get_flock_pl(flock_id, start_date, end_date)`
  - `get_user_flock_pl(user_id, start_date, end_date)`
  - `current_month_range()`

#### `export_service.py`

- Generates CSV, PDF, and XLSX outputs.
- Supports:
  - Feeding log
  - Production log
  - Inventory
  - Financial summary
  - Full XLSX workbook
- Uses:
  - Python `csv`
  - ReportLab
  - openpyxl

### Seed Script

`backend/scripts/seed.py`

- Creates one sample user/farm.
- Adds two animal classes.
- Adds three breeds and three flocks.
- Adds three feed types using bag weight and bag price.
- Adds feed assignments and initial purchase transactions.

## 3. Frontend Summary

### Package

`frontend/package.json`

Runtime dependencies:

- `@supabase/supabase-js`
- `axios`
- `lucide-react`
- `react`
- `react-datepicker`
- `react-dom`
- `react-router-dom`
- `recharts`
- `tailwindcss`

Dev dependencies:

- `@vitejs/plugin-react`
- `autoprefixer`
- `postcss`
- `vite`

Scripts:

- `npm run dev`
- `npm run build`
- `npm run preview`

### Context

#### `AuthContext.jsx`

- Creates Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`.
- Exposes:
  - `user`
  - `dbUser`
  - `loading`
  - `isOnboarded`
  - `signIn`
  - `signUp`
  - `signOut`
  - `markOnboarded`
- Stores backend user ID and farm name in localStorage:
  - `Flock_user_id`
  - `Flock_farm_name`
- If Supabase env vars are missing, auth operations throw a clear error.

#### `FarmContext.jsx`

- Exposes:
  - `farmName`
  - `userId`
  - `setFarmName`
  - `setUserId`
- Reads and writes `Flock_user_id` and `Flock_farm_name`.

### Router

`frontend/src/router.jsx`

- `/login`: `Login`
- `/onboarding`: `OnboardingWizard`
- `/`: protected app shell
  - index redirects to `/dashboard`
  - `/dashboard`: `Dashboard`
  - `/flocks`: placeholder card, "Flocks coming soon"
  - `/flocks/:id`: placeholder card, "Flock detail coming soon"
  - `/scale-house`: `ScaleHouse`
  - `/inventory`: `Inventory`
  - `/financials`: `Financials`
  - `/export`: `Export`
  - `/settings`: `Settings`

### Components

#### `AppLayout.jsx`

- Main authenticated shell.
- Sidebar navigation.
- Shows farm name from context/localStorage.
- Shows unfinished feeding badge by polling scale-house queue every 60 seconds.
- Sign out button.

#### `ProtectedRoute.jsx`

- Redirects unauthenticated users to `/login`.
- Redirects authenticated but not onboarded users to `/onboarding`.
- Allows onboarded users into the app layout.

### Pages

#### `Login.jsx`

- Sign in and sign up forms.
- Sign up collects farm name.
- Uses Supabase Auth via `AuthContext`.
- Creates backend user record after Supabase signup.

#### `OnboardingWizard.jsx`

- Guided setup for:
  - Animal classes
  - Breeds
  - Flocks
  - Feed types
  - Feed assignments
  - Review/launch
- Feed type setup now uses bag weight and bag price, with live computed cost per lb.
- Calls onboarding API endpoints incrementally as each step is saved.

#### `Dashboard.jsx`

- Live dashboard from `/api/dashboard/overview/:userId`.
- Polls every 60 seconds.
- Shows:
  - Low feed alert bar
  - Today's feeding status
  - Flock pending/fed rows
  - KPI cards for feed cost, eggs, flocks fed, yesterday P&L
  - Feed stock pills
  - Quick stats
- Dismisses alerts through inventory alert delete endpoint.

#### `ScaleHouse.jsx`

- Daily and quick feeding workflows.
- Supports manual weight and live DYMO scale stream.
- Logs feeding sessions, production values, and headcount changes.
- Shows today's feeding event log and summary.
- Can delete existing feeding events.
- Uses locked feed cost per lb for frontend preview math.

#### `Inventory.jsx`

- Live feed inventory grid.
- Shows alert banner.
- Shows feed cards with stock meter, bag size, cost per lb, par level, on-hand.
- Inline edits:
  - Feed name
  - Par level
  - Bag weight and bag price
- Purchase modal:
  - Number of bags
  - Bag weight
  - Bag price
  - Date
  - Supplier
  - Live total added, cost per lb, total cost
- Adjustment modal:
  - Direct quantity change
  - Reason
  - Date
- Expandable transaction history.

#### `Financials.jsx`

- Farm financial dashboard.
- Loads farm summary, per-flock P&L, and flock queue.
- Supports periods/custom date range.
- Revenue modal for manual revenue entries.
- Flock table rows currently navigate to `/flocks/:id`, which is still a placeholder route.

#### `Export.jsx`

- Export UI for CSV, PDF, and XLSX.
- Preview table.
- Uses export preview/generate APIs.
- Pulls flock list from scale-house queue.

#### `Settings.jsx`

- Editable setup data after onboarding.
- Supports editing/deleting:
  - Animal classes
  - Breeds
  - Flocks
  - Feed types
- Feed type editor uses bag weight, bag price, and read-only cost per lb.

### API Service Functions

#### `api.js`

- Axios client.
- Base URL from `VITE_API_BASE_URL`, default `http://localhost:5000`.

#### `usersApi.js`

- `POST /api/users`
- `GET /api/users/by-uid/:supabaseUid`

#### `onboardingApi.js`

- CRUD calls for animal classes, breeds, flocks, feed types, feed assignments.
- `GET /api/onboarding/summary/:userId`

#### `dashboardApi.js`

- `GET /api/dashboard/overview/:userId`
- `DELETE /api/inventory/alert/:alertId`

#### `scaleHouseApi.js`

- `GET /api/scale-house/queue/:userId`
- `GET /api/scale-house/queue/:userId/summary`
- `POST /api/scale-house/session`
- `GET /api/scale-house/events/today/:userId`
- `DELETE /api/scale-house/event/:id`
- `PATCH /api/scale-house/event/:id`
- `GET /api/scale-house/scale/status`
- `GET /api/scale-house/scale/stream` through `EventSource`

#### `inventoryApi.js`

- `GET /api/inventory/:userId`
- `GET /api/inventory/alerts/:userId`
- `GET /api/inventory/feed/:feedId/transactions`
- `POST /api/inventory/purchase`
- `POST /api/inventory/adjustment`
- `PATCH /api/inventory/feed/:feedId`
- `DELETE /api/inventory/alert/:alertId`

#### `financialsApi.js`

- `GET /api/financials/summary/:userId`
- `GET /api/financials/flocks/:userId`
- `POST /api/financials/revenue`
- `GET /api/financials/revenue/:userId`

#### `exportApi.js`

- `GET /api/export/preview`
- `POST /api/export/generate`

## 4. Database

### Alembic Status

Current DB revision:

```text
4c8b2f6d0a91 (head)
```

Migration history:

- `d2c72f65c70a_initial_schema.py`
- `9f1a3d7c1b2e_add_revenues.py`
- `4c8b2f6d0a91_feed_cost_per_lb_fix.py`

### Current Tables

Live database table list:

```text
alembic_version
alerts
animal_classes
breeding_logs
breeds
casualty_logs
feed_assignments
feed_types
feeding_events
financial_records
flocks
inventory_transactions
production_logs
revenues
users
```

### Recent Feed Cost Fix

The feed cost bug was fixed by adding:

- `feed_types.bag_weight`
- `feed_types.bag_price`
- `inventory_transactions.bag_weight`
- `inventory_transactions.bag_price`
- `inventory_transactions.cost_per_lb`
- `feeding_events.cost_per_lb_at_time`

Existing feed values such as `54.75` were treated as bag prices and converted to cost per lb using the default 50 lb bag weight.

Example current inventory response:

```json
{
  "name": "All Flock 16 - 20%",
  "bag_price": 54.75,
  "bag_weight": 50.0,
  "cost_per_lb": 1.095,
  "cost_per_unit": 1.095
}
```

## 5. Gaps and Incomplete Items

### Backend Gaps

- No dedicated `/api/flocks` route module yet.
  - Flock create/edit/delete exists through onboarding routes.
  - Frontend `/flocks` and `/flocks/:id` are placeholders.
- No standalone CRUD routes/UI for:
  - `BreedingLog`
  - `CasualtyLog`
  - `ProductionLog`
  - `FinancialRecord`
- `CasualtyLog` is only created through Scale House headcount change right now.
- `ProductionLog` is only created through Scale House session right now.
- `FinancialRecord` model exists, but no APScheduler nightly job currently populates it.
- Dashboard `yesterday.net_pl` reads from `FinancialRecord`; if the scheduler remains absent, that value may stay zero even when live financials show revenue/feed cost.
- Flask-Mail is configured as an extension but no alert-email workflow is implemented yet.
- Supabase Auth is handled on the frontend, but backend routes do not currently validate Supabase JWTs.
- `scale_service.detect_scale()` only returns existing connection state; it does not actively try to connect during health checks.
- Export route uses `Flock_...` filenames, good for branding, but full XLSX generation ignores requested report type and always builds the workbook.

### Frontend Gaps

- `/flocks` route is placeholder text.
- `/flocks/:id` route is placeholder text.
- Empty scaffold folders remain:
  - `frontend/src/pages/animals`
  - `frontend/src/pages/feed`
  - `frontend/src/pages/production`
  - `frontend/src/hooks`
- No standalone breeding, production, casualty, or flock detail pages yet.
- `Financials.jsx` row click navigates to `/flocks/:id`, which currently lands on placeholder UI.
- `scaleHouseApi.openScaleStream()` hardcodes `http://localhost:5000` instead of using `VITE_API_BASE_URL`.
- There is no global toast/notification system; pages use local error/toast state.

### Placeholder/Stub Findings

- `frontend/src/router.jsx`
  - `"Flocks coming soon"`
  - `"Flock detail coming soon"`
- `backend/app/services/scale_service.py`
  - Contains `pass` only inside exception cleanup during `disconnect()`, not a feature stub.

### Imports Referencing Missing Files

- No broken imports were found during verification.
- `python -m compileall farmbright/backend` passed.
- `npm run build` passed.

### Naming/Branding

- Project branding is currently `Flock`.
- A scan for old names `Farm Brite`, `FarmBrite`, `Farm Bright`, and `FarmBright` found no remaining project matches.
- Folder name remains `farmbright/`; changing the folder would require separate path/config cleanup.

## 6. What Is Working

### Backend

- Flask app factory imports and initializes successfully.
- Database connection works against the configured DB.
- Alembic is upgraded to head.
- `/health` works.
- User creation and lookup endpoints exist.
- Onboarding CRUD works for animal classes, breeds, flocks, feed types, and feed assignments.
- Dashboard overview endpoint works.
- Inventory listing, purchase, adjustment, alerts, transaction history, feed update, and alert dismiss routes work.
- Scale House queue, summary, session logging, event delete, event patch, and scale endpoints exist.
- Financial summary, per-flock P&L, revenue create, and revenue history routes exist.
- Export preview and generate routes exist for CSV/PDF/XLSX.

### Frontend

- Vite app builds successfully.
- Supabase sign in/sign up flow is wired.
- Backend user creation after signup is wired.
- Protected route and onboarding gate are wired.
- Dashboard page is live.
- Onboarding wizard is live.
- Scale House page is live.
- Inventory page is live.
- Financials page is live.
- Export page is live.
- Settings page is live.

### Verification Commands Run

```powershell
python -m compileall farmbright\backend
npm run build
flask --app app:create_app db current
```

Results:

- Backend compile: passed.
- Frontend production build: passed.
- Alembic current: `4c8b2f6d0a91 (head)`.
- Frontend build warning only: bundle chunk larger than 500 kB.

### Local Run Commands

Backend:

```powershell
cd farmbright\backend
flask --app app:create_app run --host 127.0.0.1 --port 5000
```

Frontend:

```powershell
cd farmbright\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:5000`
- Health: `http://127.0.0.1:5000/health`

## 7. Suggested Next Development Priorities

1. Build real `/flocks` and `/flocks/:id` pages.
2. Add dedicated backend routes for flock detail, production logs, casualty logs, and breeding logs.
3. Implement the APScheduler nightly financial aggregation job or remove dependency on `FinancialRecord` in dashboard.
4. Add backend Supabase JWT validation for API routes.
5. Add alert email delivery through Flask-Mail.
6. Replace hardcoded scale stream URL with `VITE_API_BASE_URL`.
7. Add automated tests for feed ledger behavior, cost locking, onboarding flow, and inventory purchases.
8. Add code splitting or manual chunks to reduce Vite production bundle warning.

