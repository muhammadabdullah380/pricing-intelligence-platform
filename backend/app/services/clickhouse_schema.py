from clickhouse_driver import Client as ClickHouseClient

from app.core.config import settings


def get_clickhouse_client() -> ClickHouseClient:
    return ClickHouseClient(
        host=settings.CLICKHOUSE_HOST,
        user=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        database=settings.CLICKHOUSE_DB,
    )


def ensure_price_observations_table() -> None:
    """Creates the price_observations table if it doesn't exist yet.

    This is the Phase 4 pipeline's storage target, and doubles as the
    foundation Phase 6 (historical pricing / trend analysis) will build
    on top of later.
    """
    client = get_clickhouse_client()
    client.execute("""
        CREATE TABLE IF NOT EXISTS price_observations (
            observed_at DateTime,
            product_id UInt64,
            store_id UInt64,
            source String,
            external_id Nullable(String),
            price Nullable(Float64),
            currency String,
            in_stock UInt8,
            title String
        ) ENGINE = MergeTree()
        ORDER BY (product_id, observed_at)
    """)