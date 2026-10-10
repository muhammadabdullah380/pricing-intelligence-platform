from datetime import datetime, timezone
import logging

from sqlalchemy import select

from app.connectors.registry import CONNECTORS
from app.core.database import SessionLocal
from app.models.alert_rule import AlertRule
from app.models.product import Product
from app.models.product_match import ProductMatch  # noqa: F401 -- registers the model with SQLAlchemy
from app.models.store import Store
from app.models.user import User, UserRole
from app.services.clickhouse_schema import get_clickhouse_client
from app.services.email import send_price_alert_email
from app.services.price_history import detect_price_changes
from app.workers.celery_app import celery_app

IDENTIFIER_FIELDS = ["upc", "ean", "gtin"]
logger = logging.getLogger(__name__)


@celery_app.task(name="schedule_store_price_pipeline")
def schedule_store_price_pipeline() -> dict:
    """Dispatch one price-fetch task for each product across all stores."""
    db = SessionLocal()
    try:
        product_ids = db.query(Product.id).order_by(Product.store_id, Product.id).all()
    finally:
        db.close()

    task_ids = [fetch_prices_for_product.delay(product_id).id for (product_id,) in product_ids]
    return {"dispatched": len(task_ids), "task_ids": task_ids}


def _email_matching_alerts(product: Product, db) -> None:
    rules = db.execute(
        select(AlertRule).where(
            AlertRule.store_id == product.store_id,
            AlertRule.email_enabled.is_(True),
        )
    ).scalars().all()
    if not rules:
        return

    owner_email = db.execute(
        select(User.email)
        .join(Store, Store.organization_id == User.organization_id)
        .where(Store.id == product.store_id, User.role == UserRole.OWNER)
        .order_by(User.id)
        .limit(1)
    ).scalar_one_or_none()
    if not owner_email:
        logger.warning("Cannot send price alerts for store %s: no owner account email found", product.store_id)
        return

    for change in detect_price_changes(product.id):
        for rule in rules:
            direction_matches = (
                rule.metric == "price_drop_pct"
                and change["direction"] == "decrease"
                or rule.metric == "price_increase_pct"
                and change["direction"] == "increase"
            )
            percent_change = abs(float(change["percent_change"]))
            if not direction_matches or percent_change < rule.threshold_pct:
                continue

            try:
                send_price_alert_email(
                    owner_email,
                    product_title=product.title,
                    source=change["source"],
                    previous_price=float(change["previous_price"]),
                    new_price=float(change["new_price"]),
                    percent_change=float(change["percent_change"]),
                    metric=rule.metric,
                    threshold_pct=float(rule.threshold_pct),
                )
            except Exception:
                logger.exception(
                    "Failed to send email for alert rule %s, product %s, source %s",
                    rule.id,
                    product.id,
                    change["source"],
                )


@celery_app.task(name="fetch_prices_for_product")
def fetch_prices_for_product(product_id: int) -> dict:
    """Scheduler -> Queue -> Worker -> Connector -> Normalizer -> Storage.

    This single task IS that pipeline for one product: look the product
    up across every connector (by identifier first, falling back to a
    title search), normalize each hit, and store it as a price
    observation in ClickHouse.
    """
    db = SessionLocal()
    try:
        product = db.get(Product, product_id)
        if not product:
            return {"product_id": product_id, "status": "not_found"}

        ch_client = get_clickhouse_client()
        found_sources = []

        for source_name, connector in CONNECTORS.items():
            result = None

            for field in IDENTIFIER_FIELDS:
                value = getattr(product, field, None)
                if value:
                    result = connector.search_by_identifier(field, value)
                    if result:
                        break

            if not result:
                results = connector.search_by_title(product.title, product.brand)
                result = results[0] if results else None

            if result:
                ch_client.execute(
                    "INSERT INTO price_observations "
                    "(observed_at, product_id, store_id, source, external_id, price, currency, in_stock, title) "
                    "VALUES",
                    [(
                        datetime.now(timezone.utc),
                        product.id,
                        product.store_id,
                        result.source,
                        result.external_id,
                        result.price,
                        result.currency,
                        1 if result.in_stock else 0,
                        result.title,
                    )],
                )
                found_sources.append(source_name)

        if found_sources:
            _email_matching_alerts(product, db)

        return {"product_id": product_id, "status": "completed", "sources_found": found_sources}
    finally:
        db.close()