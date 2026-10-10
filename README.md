# Pricing Intelligence Platform

## Project Purpose

This repository contains an early-stage, multi-tenant pricing intelligence application. It includes a FastAPI API, a Next.js dashboard, PostgreSQL catalog and account data, ClickHouse price observations, Redis-backed Celery workers, product matching, competitive analysis, alert rules, and CSV catalog import.

The Amazon, Walmart, and Best Buy connectors currently return simulated data. They are not live marketplace integrations. No separate client requirements document is present in the repository.

## Current Technology Stack

- Python 3.12
- FastAPI 0.115.0
- Uvicorn 0.30.6
- SQLAlchemy 2.0.35
- PostgreSQL 16 Alpine
- ClickHouse 24.8 Alpine
- Redis 7 Alpine
- `clickhouse-driver` 0.2.9
- `redis` 5.0.8
- Celery 5.4.0 for background price collection and six-hour periodic scheduling
- Alembic 1.13.3 for PostgreSQL schema migrations
- Next.js 16, React 19, and TypeScript for the dashboard
- Pytest and HTTPX for backend API smoke tests

## Existing Folder Structure

```text
.
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/
│   │   └── versions/
│   └── app/
│       ├── main.py
│       ├── api/           # FastAPI routers
│       ├── connectors/    # Amazon, Walmart, Best Buy and shared interface
│       ├── models/        # SQLAlchemy entities
│       ├── schemas/       # Pydantic request and response models
│       ├── services/     # CSV import, pricing, matching and ClickHouse
│       ├── workers/      # Celery app, scheduled dispatcher and tasks
│       └── tests/        # Backend smoke tests
├── frontend/
│   └── src/app/          # Next.js pages and dashboard routes
├── .github/workflows/ci.yml
├── .env.example
└── docker-compose.yml
```

The frontend is a separate Next.js app and is not currently a Docker Compose service. Run it locally with npm while the API and data services run in Compose.

## Currently Implemented Features

- JWT signup/login, password hashing, organizations, users, and organization-owned stores.
- PostgreSQL SQLAlchemy models for organizations, users, stores, products, product matches, and alert rules.
- Alembic migrations under `backend/alembic/versions/`; apply them with `alembic upgrade head`.
- Store-scoped product listing, search, category filtering, pagination, and product detail endpoints.
- CSV import validation/preview followed by commit; parsed previews are cached in Redis for 30 minutes.
- Shared connector interface and Amazon, Walmart, and Best Buy connector implementations. **All three currently return mock/simulated listings and prices; they do not contact live marketplace APIs.**
- Celery price collection tasks that store observations in ClickHouse, plus a Celery beat dispatcher scheduled every six hours.
- Manual, on-demand pipeline dispatch with `POST /api/v1/stores/{store_id}/pipeline/run`.
- Product match scoring, pending review, and confirm/reject actions.
- Price history and change detection, competitive position, store-wide opportunities, and competitor summaries.
- Alert rule create/list/delete endpoints and triggered-alert evaluation. Email-enabled rules send SMTP email from the Celery price-fetch task when SMTP is configured.
- Data-quality summary endpoint and dashboard page.
- Pytest smoke tests using an in-memory SQLite database, plus GitHub Actions CI for backend tests and frontend lint/build.

## Existing API Endpoints

The API is versioned under `/api/v1` (except `/` and `/health`). Main route groups include:

- Authentication: `POST /api/v1/auth/signup`, `POST /api/v1/auth/login`
- Stores: `GET/POST /api/v1/stores`
- Products: `GET /api/v1/stores/{store_id}/products`, `GET /api/v1/stores/{store_id}/products/{product_id}`
- CSV import: `POST /api/v1/stores/{store_id}/products/import/validate` and `/import/commit`
- Matching: product matching, pending review queue, and match decisions under `/api/v1/stores/{store_id}`
- Pricing: product price history, product/store price changes, product observations, and competitive position
- Competitive intelligence: `/opportunities`, `/competitors`, and `/data-quality` under a store
- Alerts: alert-rule create/list/delete and `GET /api/v1/stores/{store_id}/alerts`
- Pipeline: `POST /api/v1/stores/{store_id}/pipeline/run`
- Connector QA: `GET /api/v1/connectors/{source}/search`
- Service health: `GET /health` checks PostgreSQL, ClickHouse, and Redis connectivity; it does not report worker or marketplace connector health.

See the routers in `backend/app/api/` for request and response details.

## Current Docker Setup

`docker-compose.yml` defines six services:

- `api`: FastAPI backend, exposed on port `8000`, with `./backend` mounted at `/app`.
- `worker`: Celery worker that executes per-product price collection tasks.
- `beat`: Celery beat scheduler that dispatches the price pipeline every six hours.
- `postgres`: Uses `postgres:16-alpine`, exposes port `5432`, and stores data in the `postgres_data` volume.
- `clickhouse`: Uses `clickhouse/clickhouse-server:24.8-alpine`, exposes ports `8123` and `9000`, and stores data in the `clickhouse_data` volume.
- `redis`: Uses `redis:7-alpine`, exposes port `6379`, and stores data in the `redis_data` volume.

The Compose file does **not** define a frontend/web service. Run the Next.js frontend separately; it calls the API at `http://localhost:8000` by default. Compose uses `unless-stopped` restart policies. The default database and ClickHouse credentials in Compose are development credentials and must not be reused in production.

## How to Run the Current Project

Docker Desktop and Node.js 22 must be installed. From the repository root:

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec api alembic upgrade head
curl http://localhost:8000/health
```

The Compose services read `.env`. Replace the development `SECRET_KEY` before any deployment and never commit real secrets. Start the frontend in a separate terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The manual per-store pipeline trigger is available at `POST http://localhost:8000/api/v1/stores/{store_id}/pipeline/run`; Celery beat also dispatches price collection automatically every six hours.

To enable email delivery for alert rules, configure these variables in `.env` and recreate the worker (`docker compose up -d --force-recreate worker`):

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=alerts@example.com
SMTP_USE_TLS=true
```

Email is sent to the store organization’s OWNER account when an email-enabled rule matches a detected price change. Without SMTP settings, email delivery fails safely and the worker logs the failure; no email provider or credentials are included.

Run backend smoke tests inside the API container:

```bash
docker compose exec api python -m pytest -q tests
```

Run frontend checks locally:

```bash
cd frontend
npm run lint
npm run build
```

GitHub Actions runs backend dependency installation, Python compilation, and pytest, plus frontend `npm ci`, lint, and build on every push and pull request. See `.github/workflows/ci.yml`.

To stop the services:

```bash
docker compose down
```

## Current Limitations

- Amazon, Walmart, and Best Buy connectors are mocks. Real third-party API access/integration is out of scope so far; random/sample prices in the dashboard are expected until live providers are configured.
- Celery tasks run per product and have a six-hour beat schedule, but there is no durable pipeline-run history, duration/status dashboard, retry policy, or structured connector health reporting.
- `GET /health` checks backing services only. Admin connector freshness is inferred from detected price changes, not every connector invocation or every stored observation.
- Alert rules and SMTP delivery are implemented, but email requires valid SMTP settings. SMTP failures are logged and do not fail the pipeline task.
- Backups, production secrets management, staging, CI deployment, and production deployment configuration are not included.
- The backend smoke suite is focused, not comprehensive. No separate client requirements document is available in the repository.
