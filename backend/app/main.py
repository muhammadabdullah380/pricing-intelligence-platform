from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import redis
from clickhouse_driver import Client as ClickHouseClient

from app.core.config import settings
from app.core.database import engine
from app.api.alerts import router as alerts_router
from app.api.auth import router as auth_router
from app.api.stores import router as stores_router
from app.api.products import router as products_router
from app.api.connectors import router as connectors_router
from app.api.pipeline import router as pipeline_router
from app.api.matching import router as matching_router
from app.api.pricing import router as pricing_router
from app.api.competitive import router as competitive_router
from app.services.clickhouse_schema import ensure_price_observations_table

app = FastAPI(title="Pricing Intelligence Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(stores_router)
app.include_router(products_router)
app.include_router(connectors_router)
app.include_router(pipeline_router)
app.include_router(matching_router)
app.include_router(pricing_router)
app.include_router(competitive_router)
app.include_router(alerts_router)


@app.on_event("startup")
def on_startup():
    ensure_price_observations_table()


@app.get("/")
def root():
    return {"service": "pricing-intelligence-api", "status": "running"}


@app.get("/health")
def health_check():
    """Confirms the API can actually reach Postgres, ClickHouse, and Redis.

    This is Phase 1's core deliverable: proving the whole stack is wired
    together correctly before any real feature code gets built on top of it.
    """
    status = {"postgres": "unknown", "clickhouse": "unknown", "redis": "unknown"}

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        status["postgres"] = "ok"
    except Exception as e:
        status["postgres"] = f"error: {e}"

    try:
        ch_client = ClickHouseClient(
            host=settings.CLICKHOUSE_HOST,
            user=settings.CLICKHOUSE_USER,
            password=settings.CLICKHOUSE_PASSWORD,
            database=settings.CLICKHOUSE_DB,
        )
        ch_client.execute("SELECT 1")
        status["clickhouse"] = "ok"
    except Exception as e:
        status["clickhouse"] = f"error: {e}"

    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        status["redis"] = "ok"
    except Exception as e:
        status["redis"] = f"error: {e}"

    all_ok = all(v == "ok" for v in status.values())
    return {"all_systems_ok": all_ok, "details": status}