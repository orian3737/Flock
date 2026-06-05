# Flock

Flock is a full-stack farm management web application for home and small-scale farmers. It is designed around user-defined farm structures: each farmer configures their own animal classes, breeds, flocks, feed systems, and operational workflows through guided onboarding.

Flock v1.0 keeps feed inventory as a live ledger, derives financial views from operational data, and supports USB scale integration for DYMO S400 HID scales.

## Local Setup

1. Start local Postgres:

   ```bash
   docker compose up -d db
   ```

2. Configure backend environment:

   ```bash
   cd backend
   cp .env.example .env
   ```

3. Create and activate a Python virtual environment, then install dependencies:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. Run the Flask API:

   ```bash
   flask --app app:create_app run
   ```

5. Install frontend dependencies and start the React app:

   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

## Environment Variables

Backend variables are defined in `backend/.env.example`.

- `FLASK_APP`: Flask application entry point.
- `FLASK_ENV`: Local Flask environment name.
- `SECRET_KEY`: Flask secret key for sessions and signing.
- `DATABASE_URL`: PostgreSQL connection string for development or Supabase.
- `TEST_DATABASE_URL`: PostgreSQL connection string for test runs.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_KEY`: Supabase anon or service role key.
- `MAIL_SERVER`: SMTP server for alert emails.
- `MAIL_PORT`: SMTP port.
- `MAIL_USE_TLS`: Whether SMTP should use TLS.
- `MAIL_USERNAME`: SMTP username.
- `MAIL_PASSWORD`: SMTP password.

Frontend variables:

- `VITE_API_BASE_URL`: Base URL for the Flask API.

## Module Map

- `backend/app/models`: One SQLAlchemy model file per module.
- `backend/app/routes`: One Flask Blueprint per module.
- `backend/app/services`: Business logic, scale integration, export generation, alerts, and ledger workflows.
- `backend/app/utils`: Shared backend helpers.
- `frontend/src/components`: Shared React UI components.
- `frontend/src/pages/onboarding`: Guided farm setup and editable configuration screens.
- `frontend/src/pages/animals`: User-defined animal classes, breeds, flocks, and records.
- `frontend/src/pages/feed`: Feed inventory, purchases, and consumption ledger.
- `frontend/src/pages/production`: Eggs, milk, meat, garden, or other farmer-defined output logs.
- `frontend/src/pages/finances`: Derived costs, margins, and financial reporting.
- `frontend/src/pages/reports`: PDF, XLSX, and CSV exports.
- `frontend/src/pages/settings`: Farm, account, alert, and integration settings.
- `frontend/src/hooks`: Custom React hooks.
- `frontend/src/services`: API client functions.
- `frontend/src/context`: Auth and farm state providers.

## Health Check

The backend exposes:

```http
GET /health
```

Expected response shape:

```json
{
  "status": "ok",
  "db": "connected",
  "scale": "detected",
  "version": "1.0.0"
}
```

When the DYMO S400 is not available, `scale` returns `not_detected`.

## DYMO S400 Scale Setup

Flock uses the Python `hidapi` package to detect DYMO USB HID scales.

1. Connect the DYMO S400 to the machine running the Flask backend.
2. Confirm the operating system can see the USB HID device.
3. Install backend dependencies with `pip install -r backend/requirements.txt`.
4. On Windows, run the backend from a terminal with permission to access USB HID devices.
5. Visit `/health` and confirm `scale` returns `detected`.

If the scale is connected but not detected, unplug and reconnect it, check the USB cable, and confirm no other scale software is holding exclusive access to the device.

## Deployment Notes

Local development uses the `db` service in `docker-compose.yml`. Production should point `DATABASE_URL` at Supabase PostgreSQL and configure Supabase Auth using `SUPABASE_URL` and `SUPABASE_KEY`.

### GitHub Pages Frontend

The React frontend can be hosted for free on GitHub Pages from the `orian3737/Flock` repository. The workflow lives at `.github/workflows/deploy-frontend.yml` and builds `farmbright/frontend`.

Required GitHub repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY`
- `VITE_API_BASE_URL`

The workflow sets `VITE_BASE_PATH=/Flock/`, so the published frontend URL is expected to be:

```text
https://orian3737.github.io/Flock/
```

GitHub Pages only hosts the static React build. The Flask backend still needs a separate host, and `VITE_API_BASE_URL` must point to that hosted backend URL.

---

Flock v1.0 - Built for the everyday farmer
                                             Built by Ryan Murzyn
