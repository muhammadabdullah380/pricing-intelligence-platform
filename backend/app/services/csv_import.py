"""CSV catalog import: validate -> preview -> commit.

Parsed + validated rows are cached in Redis (keyed by a generated
import_id) rather than written to Postgres immediately. This lets the
user see a preview and error report before anything actually lands in
their catalog, matching the spec's Validation -> Preview -> Import flow.
"""
import csv
import io
import json
import uuid

import redis as redis_lib
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.product import Product

_redis = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

IMPORT_TTL_SECONDS = 1800  # preview must be committed within 30 minutes
REQUIRED_COLUMNS = {"Product Name"}


def _parse_price(raw: str) -> tuple[float | None, str | None]:
    raw = (raw or "").strip()
    if not raw:
        return None, None
    cleaned = raw.replace("$", "").replace(",", "")
    try:
        return float(cleaned), None
    except ValueError:
        return None, f"Price '{raw}' is not a valid number"


def parse_and_validate_csv(file_bytes: bytes, store_id: int, db: Session) -> tuple[str, list[dict]]:
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise ValueError("CSV file has no header row")

    missing = REQUIRED_COLUMNS - set(reader.fieldnames)
    if missing:
        raise ValueError(f"CSV is missing required column(s): {', '.join(missing)}")

    existing_skus = set(
        db.execute(
            select(Product.sku).where(Product.store_id == store_id, Product.sku.isnot(None))
        ).scalars().all()
    )
    seen_skus_in_file: set[str] = set()

    rows: list[dict] = []
    for i, raw_row in enumerate(reader, start=2):  # row 1 is the header
        messages: list[str] = []
        row_status = "valid"

        name = (raw_row.get("Product Name") or "").strip()
        if not name:
            messages.append("Product Name is required")
            row_status = "error"

        sku = (raw_row.get("SKU") or "").strip() or None
        upc = (raw_row.get("UPC") or "").strip() or None
        ean = (raw_row.get("EAN") or "").strip() or None
        gtin = (raw_row.get("GTIN") or "").strip() or None

        if not any([sku, upc, ean, gtin]):
            messages.append("No identifier provided (SKU/UPC/EAN/GTIN) — matching accuracy may be lower")
            if row_status == "valid":
                row_status = "warning"

        if sku:
            if sku in seen_skus_in_file:
                messages.append(f"Duplicate SKU '{sku}' within this file")
                row_status = "error"
            seen_skus_in_file.add(sku)

        price, price_error = _parse_price(raw_row.get("Price", ""))
        if price_error:
            messages.append(price_error)
            row_status = "error"

        will_update = bool(sku and sku in existing_skus)
        if will_update:
            messages.append(f"Existing product with SKU '{sku}' will be updated")

        rows.append({
            "row_number": i,
            "data": {
                "sku": sku,
                "title": name or None,
                "brand": (raw_row.get("Brand") or "").strip() or None,
                "model_number": (raw_row.get("Model") or "").strip() or None,
                "upc": upc,
                "ean": ean,
                "gtin": gtin,
                "list_price": price,
                "url": (raw_row.get("URL") or "").strip() or None,
                "category": (raw_row.get("Category") or "").strip() or None,
            },
            "status": row_status,
            "messages": messages,
            "will_update": will_update,
        })

    import_id = str(uuid.uuid4())
    _redis.set(
        f"csv_import:{import_id}",
        json.dumps({"store_id": store_id, "rows": rows}),
        ex=IMPORT_TTL_SECONDS,
    )
    return import_id, rows


def load_import(import_id: str) -> dict | None:
    raw = _redis.get(f"csv_import:{import_id}")
    return json.loads(raw) if raw else None


def delete_import(import_id: str) -> None:
    _redis.delete(f"csv_import:{import_id}")