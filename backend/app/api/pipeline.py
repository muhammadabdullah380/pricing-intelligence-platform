from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.stores import get_owned_store
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.product import Product
from app.models.user import User
from app.services.clickhouse_schema import get_clickhouse_client
from app.workers.tasks import fetch_prices_for_product

router = APIRouter(prefix="/api/v1/stores/{store_id}", tags=["pipeline"])


@router.post("/pipeline/run")
def run_pipeline(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fans out one background task per product in the store -- this IS
    the 'Scheduler -> Queue' part of the pipeline in action."""
    get_owned_store(store_id, current_user, db)

    product_ids = db.execute(select(Product.id).where(Product.store_id == store_id)).scalars().all()

    task_ids = []
    for pid in product_ids:
        task = fetch_prices_for_product.delay(pid)
        task_ids.append(task.id)

    return {"dispatched": len(task_ids), "task_ids": task_ids}


@router.get("/products/{product_id}/observations")
def get_observations(
    store_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reads back what the pipeline actually stored, for verification."""
    get_owned_store(store_id, current_user, db)
    product = db.get(Product, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")

    client = get_clickhouse_client()
    rows = client.execute(
        "SELECT observed_at, source, external_id, price, currency, in_stock, title "
        "FROM price_observations WHERE product_id = %(pid)s ORDER BY observed_at DESC",
        {"pid": product_id},
    )

    return [
        {
            "observed_at": str(r[0]),
            "source": r[1],
            "external_id": r[2],
            "price": r[3],
            "currency": r[4],
            "in_stock": bool(r[5]),
            "title": r[6],
        }
        for r in rows
    ]