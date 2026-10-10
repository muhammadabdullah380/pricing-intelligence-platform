from app.services.clickhouse_schema import get_clickhouse_client
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product


def get_price_history(product_id: int) -> dict[str, list[dict]]:
    """Full price observation history for one product, grouped by source
    and ordered oldest-to-newest. This is the raw material behind any
    price trend chart.
    """
    client = get_clickhouse_client()
    rows = client.execute(
        "SELECT source, observed_at, price, currency, in_stock "
        "FROM price_observations WHERE product_id = %(pid)s "
        "ORDER BY source, observed_at ASC",
        {"pid": product_id},
    )

    history: dict[str, list[dict]] = {}
    for source, observed_at, price, currency, in_stock in rows:
        history.setdefault(source, []).append({
            "observed_at": str(observed_at),
            "price": price,
            "currency": currency,
            "in_stock": bool(in_stock),
        })
    return history


def detect_price_changes(product_id: int) -> list[dict]:
    """Compares each source's two most recent observations. If the price
    moved, that's a detected price change -- the core signal behind
    Phase 9's alerting later.
    """
    history = get_price_history(product_id)
    changes = []

    for source, observations in history.items():
        if len(observations) < 2:
            continue

        previous, latest = observations[-2], observations[-1]
        if previous["price"] is None or latest["price"] is None:
            continue
        if previous["price"] == latest["price"]:
            continue

        delta = round(latest["price"] - previous["price"], 2)
        changes.append({
            "source": source,
            "previous_price": previous["price"],
            "new_price": latest["price"],
            "delta": delta,
            "direction": "increase" if delta > 0 else "decrease",
            "percent_change": round((delta / previous["price"]) * 100, 2),
            "observed_at": latest["observed_at"],
        })

    return changes


def get_store_price_changes(store_id: int, db: Session) -> list[dict]:
    """Return detected price changes for every product in a store."""
    products = db.execute(select(Product).where(Product.store_id == store_id)).scalars().all()

    results = []
    for product in products:
        changes = detect_price_changes(product.id)
        for change in changes:
            results.append({"product_id": product.id, "product_title": product.title, **change})

    return results