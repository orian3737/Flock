# Flock Codebase Report

Generated from workspace root: `C:\Users\orian\OneDrive\Desktop\FarmApp`

Notes:
- Source tree excludes generated/dependency directories: `.git/`, `node_modules/`, `dist/`, `__pycache__/`, and `*.pyc`.
- A root `.env` and a secret-looking text file are present locally, but their contents were not read or included.

## 1. Project Structure

```text
FarmApp/
  .env                         # local secret file, contents not inspected
  .gitignore
  Flocker Supa PW    4J0ZJrvBov.txt  # local secret-looking file, contents not inspected
  FarmBuild.txt
  report.md
  Flock/
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
          user.py
        routes/
          __init__.py
          health.py
          onboarding.py
        services/
          __init__.py
          export_service.py
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
      scripts/
        seed.py
    frontend/
      index.html
      package-lock.json
      package.json
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
        context/
          AuthContext.jsx
          FarmContext.jsx
        hooks/
          .gitkeep
        pages/
          animals/
            .gitkeep
          dashboard/
            Dashboard.jsx
          feed/
            .gitkeep
          finances/
            .gitkeep
          onboarding/
            .gitkeep
            OnboardingWizard.jsx
          production/
            .gitkeep
          reports/
            .gitkeep
          settings/
            .gitkeep
        services/
          api.js
          onboardingApi.js
```

## 2. Backend Summary

### Flask App Factory

File: `Flock/backend/app/__init__.py`

- Creates Flask app via `create_app(config_name="development")`.
- Loads config from `config_by_name`.
- Initializes `db`, `migrate`, `login_manager`, and `mail`.
- Imports `app.models` inside app context so Flask-Migrate can see metadata.
- Registers:
  - `health_bp`
  - `onboarding_bp`

### Registered Blueprints And Routes

#### `health_bp`

File: `Flock/backend/app/routes/health.py`

- Prefix: none
- Routes:
  - `GET /health`
- Behavior:
  - Executes `SELECT 1` through SQLAlchemy.
  - Reports DB status as `connected` or `not_connected`.
  - Calls `detect_scale()` and reports `scale` as `detected` or `not_detected`.
  - Returns:

```json
{
  "status": "ok",
  "db": "connected",
  "scale": "detected|not_detected",
  "version": "1.0.0"
}
```

#### `onboarding_bp`

File: `Flock/backend/app/routes/onboarding.py`

- Prefix: `/api/onboarding`
- CORS enabled for `http://localhost:5173`
- Routes:
  - `POST /api/onboarding/animal-class`
    - Body: `{ user_id, name }`
    - Creates `AnimalClass`
    - Returns `{ id, name }`
  - `POST /api/onboarding/breed`
    - Body: `{ animal_class_id, name }`
    - Creates `Breed`
    - Returns `{ id, name, animal_class_id }`
  - `POST /api/onboarding/flock`
    - Body: `{ breed_id, name, designation, pen_name, current_headcount }`
    - Creates `Flock`
    - Returns full flock object
  - `POST /api/onboarding/feed-type`
    - Body: `{ user_id, name, unit, cost_per_unit, par_level, current_on_hand }`
    - Creates `FeedType`
    - Returns full feed type object
  - `POST /api/onboarding/feed-assignment`
    - Body: `{ flock_id, feed_type_id }`
    - Creates `FeedAssignment`
    - Returns `{ id, flock_id, feed_type_id }`
  - `GET /api/onboarding/summary/<user_id>`
    - Returns animal class, breed, flock, feed assignment, and feed type summary tree
- Duplicate/conflict handling:
  - App-level duplicate checks return `409` with JSON messages.
  - SQLAlchemy `IntegrityError` is caught and converted to `409`.

### SQLAlchemy Models

All models use Flask-SQLAlchemy through `db` from `Flock/backend/app/extensions.py`.

#### `User`

File: `Flock/backend/app/models/user.py`

- Table: `users`
- Fields:
  - `id`: integer primary key
  - `supabase_uid`: string, unique, indexed, required
  - `email`: string, unique, indexed, required
  - `farm_name`: string, required
  - `created_at`: timezone datetime, server default `now()`
- Relationships:
  - `animal_classes`: one-to-many `AnimalClass`, delete-orphan
  - `feed_types`: one-to-many `FeedType`, delete-orphan
  - `alerts`: one-to-many `Alert`, delete-orphan

#### `AnimalClass`

File: `Flock/backend/app/models/animal_class.py`

- Table: `animal_classes`
- Fields:
  - `id`: integer primary key
  - `user_id`: FK `users.id`, indexed, required
  - `name`: string, required
- Relationships:
  - `user`: many-to-one `User`
  - `breeds`: one-to-many `Breed`, delete-orphan

#### `Breed`

File: `Flock/backend/app/models/breed.py`

- Table: `breeds`
- Fields:
  - `id`: integer primary key
  - `animal_class_id`: FK `animal_classes.id`, indexed, required
  - `name`: string, required
- Relationships:
  - `animal_class`: many-to-one `AnimalClass`
  - `flocks`: one-to-many `Flock`, delete-orphan

#### `Flock`

File: `Flock/backend/app/models/flock.py`

- Table: `flocks`
- Fields:
  - `id`: integer primary key
  - `breed_id`: FK `breeds.id`, indexed, required
  - `name`: string, required
  - `designation`: enum `layer|breeder|meat|mixed`, required
  - `pen_name`: string, nullable
  - `current_headcount`: integer, default `0`, required
  - `created_at`: timezone datetime, server default `now()`
- Relationships:
  - `breed`: many-to-one `Breed`
  - `casualty_logs`: one-to-many `CasualtyLog`, delete-orphan
  - `feed_assignments`: one-to-many `FeedAssignment`, delete-orphan
  - `feeding_events`: one-to-many `FeedingEvent`, delete-orphan
  - `production_logs`: one-to-many `ProductionLog`, delete-orphan
  - `breeding_logs`: one-to-many `BreedingLog`, delete-orphan
  - `financial_records`: one-to-many `FinancialRecord`, delete-orphan

#### `CasualtyLog`

File: `Flock/backend/app/models/casualty_log.py`

- Table: `casualty_logs`
- Fields:
  - `id`: integer primary key
  - `flock_id`: FK `flocks.id`, indexed, required
  - `date`: date, default `date.today`
  - `change_amount`: integer, required
  - `notes`: text, nullable
  - `created_at`: timezone datetime, server default `now()`
- Relationships:
  - `flock`: many-to-one `Flock`
- Event listeners:
  - `after_insert`: increments `Flock.current_headcount` by `change_amount`

#### `FeedType`

File: `Flock/backend/app/models/feed_type.py`

- Table: `feed_types`
- Fields:
  - `id`: integer primary key
  - `user_id`: FK `users.id`, indexed, required
  - `name`: string, required
  - `unit`: enum `lbs|kg`, required
  - `cost_per_unit`: float, default `0.0`, required
  - `par_level`: float, default `0.0`, required
  - `current_on_hand`: float, default `0.0`, required
- Relationships:
  - `user`: many-to-one `User`
  - `feed_assignments`: one-to-many `FeedAssignment`, delete-orphan
  - `feeding_events`: one-to-many `FeedingEvent`, delete-orphan
  - `inventory_transactions`: one-to-many `InventoryTransaction`, delete-orphan
  - `alerts`: one-to-many `Alert`, delete-orphan

#### `FeedAssignment`

File: `Flock/backend/app/models/feed_assignment.py`

- Table: `feed_assignments`
- Fields:
  - `id`: integer primary key
  - `flock_id`: FK `flocks.id`, indexed, required
  - `feed_type_id`: FK `feed_types.id`, indexed, required
- Constraints:
  - Unique pair: `(flock_id, feed_type_id)`
- Relationships:
  - `flock`: many-to-one `Flock`
  - `feed_type`: many-to-one `FeedType`

#### `FeedingEvent`

File: `Flock/backend/app/models/feeding_event.py`

- Table: `feeding_events`
- Fields:
  - `id`: integer primary key
  - `flock_id`: FK `flocks.id`, indexed, required
  - `feed_type_id`: FK `feed_types.id`, indexed, required
  - `date`: date, default `date.today`
  - `timestamp`: timezone datetime, default `datetime.utcnow`
  - `total_weight`: float, required
  - `input_method`: enum `manual|scale`, required
- Relationships:
  - `flock`: many-to-one `Flock`
  - `feed_type`: many-to-one `FeedType`
- Hybrid/computed properties:
  - `weight_per_bird`: `total_weight / flock.current_headcount`
  - `cost_total`: `total_weight * feed_type.cost_per_unit`
  - `cost_per_bird`: `cost_total / flock.current_headcount`
- Event listeners:
  - `after_insert`:
    - Deducts `total_weight` from `FeedType.current_on_hand`
    - Inserts an `InventoryTransaction` of type `feeding`
    - Creates a low-feed `Alert` if `current_on_hand <= par_level`

#### `InventoryTransaction`

File: `Flock/backend/app/models/inventory_transaction.py`

- Table: `inventory_transactions`
- Fields:
  - `id`: integer primary key
  - `feed_type_id`: FK `feed_types.id`, indexed, required
  - `date`: date, default `date.today`
  - `transaction_type`: enum `purchase|feeding|adjustment`, required
  - `quantity_change`: float, required
  - `unit_cost`: float, nullable
  - `notes`: text, nullable
- Relationships:
  - `feed_type`: many-to-one `FeedType`

#### `ProductionLog`

File: `Flock/backend/app/models/production_log.py`

- Table: `production_logs`
- Fields:
  - `id`: integer primary key
  - `flock_id`: FK `flocks.id`, indexed, required
  - `date`: date, default `date.today`
  - `egg_count`: integer, nullable
  - `water_consumed`: float, nullable
  - `avg_weight`: float, nullable
  - `notes`: text, nullable
- Relationships:
  - `flock`: many-to-one `Flock`

#### `BreedingLog`

File: `Flock/backend/app/models/breeding_log.py`

- Table: `breeding_logs`
- Fields:
  - `id`: integer primary key
  - `flock_id`: FK `flocks.id`, indexed, required
  - `date`: date, default `date.today`
  - `male_id`: nullable FK `flocks.id`
  - `female_id`: nullable FK `flocks.id`
  - `outcome_notes`: text, nullable
  - `expected_hatch_date`: date, nullable
- Relationships:
  - `flock`: many-to-one `Flock`
  - `male`: many-to-one `Flock`
  - `female`: many-to-one `Flock`
- Note:
  - There is no individual animal model yet, so `male_id` and `female_id` currently point to `flocks.id`.

#### `FinancialRecord`

File: `Flock/backend/app/models/financial_record.py`

- Table: `financial_records`
- Fields:
  - `id`: integer primary key
  - `flock_id`: FK `flocks.id`, indexed, required
  - `date`: date, default `date.today`
  - `total_feed_cost`: float, default `0.0`, required
  - `total_revenue`: float, default `0.0`, required
  - `net_pl`: float, default `0.0`, required
  - `cost_per_bird`: float, default `0.0`, required
  - `revenue_source`: enum `egg_sales|meat_sales|other`, required
- Relationships:
  - `flock`: many-to-one `Flock`
- Missing:
  - No scheduled nightly job exists yet to populate this table.

#### `Alert`

File: `Flock/backend/app/models/alert.py`

- Table: `alerts`
- Fields:
  - `id`: integer primary key
  - `user_id`: FK `users.id`, indexed, required
  - `feed_type_id`: nullable FK `feed_types.id`, indexed
  - `alert_type`: enum `low_feed`, required
  - `message`: text, required
  - `is_read`: boolean, default `False`, required
  - `created_at`: timezone datetime, server default `now()`
- Relationships:
  - `user`: many-to-one `User`
  - `feed_type`: many-to-one `FeedType`

### Services

#### `scale_service.py`

- Defines `DYMO_VENDOR_ID = 0x0922`.
- `detect_scale()`:
  - Imports `hid`.
  - Calls `hid.enumerate()`.
  - Returns `True` if any HID device has matching vendor ID.
  - Returns `False` on missing import or HID enumeration failure.

#### `export_service.py`

- Stub only:
  - Contains docstring: `Export service placeholder for PDF, XLSX, and CSV generation.`
  - No functions implemented yet.

#### `services/__init__.py`

- Stub package marker only:
  - Contains docstring: `Business logic services for Flock.`

### `config.py`

File: `Flock/backend/config.py`

```python
import os

from dotenv import load_dotenv


load_dotenv()


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://Flock:Flock@localhost:5432/Flock",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    ENV = "development"


class ProductionConfig(BaseConfig):
    DEBUG = False
    ENV = "production"


class TestingConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://Flock:Flock@localhost:5432/Flock_test",
    )


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
```

### `.env.example`

File: `Flock/backend/.env.example`

```dotenv
FLASK_APP=app:create_app
FLASK_ENV=development
SECRET_KEY=replace-me
DATABASE_URL=postgresql://Flock:Flock@localhost:5432/Flock
TEST_DATABASE_URL=postgresql://Flock:Flock@localhost:5432/Flock_test
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-or-anon-key
MAIL_SERVER=smtp.example.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=alerts@example.com
MAIL_PASSWORD=replace-me
```

### Missing Or Incomplete Backend Implementations

- `export_service.py` is a placeholder with no export functions.
- `services/__init__.py`, `utils/__init__.py`, `routes/__init__.py`, and `models/__init__.py` are package wiring files, not feature implementations.
- No auth routes or Supabase Auth integration flow yet.
- No CRUD/update/delete routes for existing onboarding-created objects yet.
- No routes for:
  - Users
  - Alerts
  - Casualty/addition logs
  - Feeding events
  - Inventory transactions
  - Production logs
  - Breeding logs
  - Financial records
- No scheduled APScheduler job for nightly financial aggregation.
- No Flask-Mail alert dispatch logic yet.
- No scale read endpoint yet, only scale detection through `/health`.
- `BreedingLog.male_id` and `female_id` point to `flocks.id`; no individual animal table exists.
- Alembic `script.py.mako` contains template `pass` fallbacks for empty generated revisions.

## 3. Frontend Summary

### Router Definitions

File: `Flock/frontend/src/router.jsx`

- `/onboarding`
  - Element: `<OnboardingWizard />`
  - Standalone page, no sidebar.
- `/`
  - Element: `<AppLayout />`
  - Children:
    - index route redirects to `/dashboard`
    - `/dashboard`: `<Dashboard />`
    - `/flocks`: inline placeholder `Flocks coming soon`
    - `/flocks/:id`: inline placeholder `Flock detail coming soon`
    - `/scale-house`: inline placeholder `Scale House coming soon`
    - `/inventory`: inline placeholder `Inventory coming soon`
    - `/financials`: inline placeholder `Financials coming soon`
    - `/export`: inline placeholder `Export coming soon`
    - `/settings`: inline placeholder `Settings coming soon`

File: `Flock/frontend/src/main.jsx`

- Renders `RouterProvider` with `router`.
- Wraps app in:
  - `<AuthProvider>`
  - `<FarmProvider>`
  - `<React.StrictMode>`

### Existing Pages And Components

#### Components

- `Flock/frontend/src/components/AppLayout.jsx`
  - Fixed left sidebar app shell.
  - Farm name read from `localStorage`.
  - Nav links with lucide icons.
  - Renders child route with `<Outlet />`.
- `Flock/frontend/src/components/.gitkeep`
  - Empty folder marker.

#### Pages

- `Flock/frontend/src/pages/dashboard/Dashboard.jsx`
  - Basic dashboard with three stat cards:
    - Active flocks: `0`
    - Feed types: `0`
    - Low-stock alerts: `0`
  - Static placeholder data only.
- `Flock/frontend/src/pages/onboarding/OnboardingWizard.jsx`
  - Full five-step onboarding wizard:
    - Animal Classes
    - Breeds
    - Flocks
    - Feed Setup
    - Review
  - Calls onboarding API helpers.
  - Stores `Flock_user_id` and `Flock_farm_name` in `localStorage`.
  - Navigates to `/dashboard` on launch.
- Empty page folders with `.gitkeep` only:
  - `animals`
  - `feed`
  - `finances`
  - `production`
  - `reports`
  - `settings`

#### Contexts

- `Flock/frontend/src/context/AuthContext.jsx`
  - Provides `{ user, setUser }`.
  - No Supabase Auth implementation yet.
- `Flock/frontend/src/context/FarmContext.jsx`
  - Provides `{ farm, setFarm }`.
  - No farm loading/persistence implementation yet.

#### Other

- `Flock/frontend/src/App.jsx`
  - Contains simple `<main>Flock</main>`.
  - Not used by the current router-based entrypoint.

### API Call Functions

#### `api.js`

File: `Flock/frontend/src/services/api.js`

- Creates Axios client:
  - `baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"`

#### `onboardingApi.js`

File: `Flock/frontend/src/services/onboardingApi.js`

- `createAnimalClass(payload)`
  - `POST /api/onboarding/animal-class`
- `createBreed(payload)`
  - `POST /api/onboarding/breed`
- `createFlock(payload)`
  - `POST /api/onboarding/flock`
- `createFeedType(payload)`
  - `POST /api/onboarding/feed-type`
- `createFeedAssignment(payload)`
  - `POST /api/onboarding/feed-assignment`
- `getOnboardingSummary(userId)`
  - `GET /api/onboarding/summary/${userId}`

### `package.json`

File: `Flock/frontend/package.json`

```json
{
  "name": "flock-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-datepicker": "^7.6.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.2",
    "recharts": "^2.15.0",
    "tailwindcss": "^3.4.17"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "vite": "^6.0.6"
  }
}
```

### Placeholder Or Stub Frontend Components

- Router inline placeholders:
  - `/flocks`
  - `/flocks/:id`
  - `/scale-house`
  - `/inventory`
  - `/financials`
  - `/export`
  - `/settings`
- `Dashboard.jsx` has static placeholder counts.
- Empty `.gitkeep` page folders exist for modules that are not implemented.
- `AuthContext.jsx` and `FarmContext.jsx` are state containers only; no backend or Supabase integration yet.
- `App.jsx` is effectively obsolete under the current `RouterProvider` setup.

## 4. Database

### Alembic Migration Status

Commands run from `Flock/backend` using `python -m flask`:

```text
python -m flask --app app:create_app db heads
-> d2c72f65c70a (head)

python -m flask --app app:create_app db current
-> d2c72f65c70a (head)
```

Result:
- The connected database is at the current Alembic head.
- Alembic implementation reported `PostgresqlImpl`.

### Migration Files

- `Flock/backend/migrations/versions/d2c72f65c70a_initial_schema.py`
  - Creates the initial schema.
  - Revision: `d2c72f65c70a`
  - Down revision: `None`

### Live Tables Detected

SQLAlchemy inspector reported these tables:

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
users
```

## 5. Gaps And Incomplete Items

### Routes Defined But Not Yet Built

Frontend routes exist but only show placeholder content:

- `/flocks`
- `/flocks/:id`
- `/scale-house`
- `/inventory`
- `/financials`
- `/export`
- `/settings`

### Models Defined But No Corresponding Routes

No dedicated backend route modules exist for:

- `User`
- `Alert`
- `CasualtyLog`
- `FeedingEvent`
- `InventoryTransaction`
- `ProductionLog`
- `BreedingLog`
- `FinancialRecord`

Partial backend route coverage exists for:

- `AnimalClass`
- `Breed`
- `Flock`
- `FeedType`
- `FeedAssignment`

Those are currently create-only plus onboarding summary. There are no edit/delete endpoints yet, even though the product philosophy requires all onboarding-created objects to remain editable.

### Frontend Pages That Are Stubs

- `Dashboard.jsx` uses static values.
- Inline placeholders in `router.jsx`:
  - Flocks
  - Flock detail
  - Scale House
  - Inventory
  - Financials
  - Export
  - Settings
- Empty module directories:
  - `pages/animals`
  - `pages/feed`
  - `pages/finances`
  - `pages/production`
  - `pages/reports`
  - `pages/settings`

### Imports Referencing Missing Files

No missing import targets were detected by:

- `python -m compileall backend`
- `npm run build`

Both completed successfully.

### Other Incomplete Items

- Supabase Auth is not wired into frontend or backend yet.
- Backend stores `supabase_uid`, but no auth verification middleware exists.
- No user creation endpoint exists, so onboarding currently assumes a numeric `user_id`.
- Onboarding UI defaults to `user_id = 1`, which requires a matching user row in the database.
- No API exists for editing onboarding-created objects after setup.
- Feed ledger has model/event behavior for feeding inserts, but there is no feeding event route or UI yet.
- Inventory purchase/adjustment routes and UI are not implemented.
- Financial records are modeled but not generated by a scheduled job yet.
- Flask-Mail dependency exists, but no email alert service exists.
- Export dependencies exist, but PDF/XLSX/CSV export logic is not implemented.
- DYMO scale detection exists through `/health`, but no weight read/scale-house workflow exists.
- Migration has app-level enum creation through generated SQLAlchemy `Enum`; verify enum downgrade behavior when schema evolves.
- Duplicate checks are mostly app-level, not DB-level unique constraints, except for user uniques and feed assignment pair uniqueness.

## 6. What Is Working

Verified in this audit:

- Backend modules compile:

```text
python -m compileall backend
-> success
```

- Frontend production build succeeds:

```text
npm run build
-> success
```

- Alembic reports the connected database is current:

```text
d2c72f65c70a (head)
```

- Live database tables exist for the initial schema.

Currently runnable:

- Frontend:
  - `cd Flock/frontend`
  - `npm install`
  - `npm run dev`
  - Dashboard route renders through the app shell.
  - Onboarding route renders and attempts to call Flask API.
- Backend:
  - `cd Flock/backend`
  - `python -m flask --app app:create_app run`
  - `/health` can check DB and DYMO scale detection.
  - `/api/onboarding/*` create endpoints can work if:
    - backend dependencies are installed,
    - database is reachable,
    - migrations are applied,
    - a referenced `users.id` exists.
- Database:
  - Initial migration is applied to the currently connected PostgreSQL database.
  - Seed script exists at `Flock/backend/scripts/seed.py`, but this audit did not run it.

End-to-end caveat:
- The onboarding UI cannot complete from a fresh empty DB unless a matching `users.id` exists first. Supabase Auth/user provisioning is the next missing piece for a real first-run onboarding flow.
