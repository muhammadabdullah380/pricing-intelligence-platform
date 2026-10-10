from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.stores import get_owned_store
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.product import Product
from app.models.user import User
from app.services.price_history import detect_price_changes, get_price_history, get_store_price_changes

router = APIRouter(prefix="/api/v1/stores/{store_id}", tags=["pricing"])


@router.get("/products/{product_id}/price-history")
def price_history(
    store_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)
    product = db.get(Product, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")

    return get_price_history(product_id)


@router.get("/products/{product_id}/price-changes")
def price_changes(
    store_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)
    product = db.get(Product, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")

    return detect_price_changes(product_id)


@router.get("/price-changes")
def all_price_changes(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store-wide view: every product with a detected price change, in
    one call -- this is what a 'recent price movements' dashboard page
    would read from."""
    get_owned_store(store_id, current_user, db)
    return get_store_price_changes(store_id, db)