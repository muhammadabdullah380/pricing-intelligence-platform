from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.stores import get_owned_store
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.product import Product
from app.models.product_match import ProductMatch
from app.models.user import User
from app.schemas.match import MatchDecisionRequest, ProductMatchOut
from app.services.matching import run_matching_for_product

router = APIRouter(prefix="/api/v1/stores/{store_id}", tags=["matching"])


@router.post("/products/{product_id}/match", response_model=list[ProductMatchOut])
def match_product(
    store_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    product = db.get(Product, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")

    return run_matching_for_product(product, db)


@router.get("/matches/pending", response_model=list[ProductMatchOut])
def list_pending_matches(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The human review queue -- mid-confidence matches waiting for a
    person to confirm or reject them."""
    get_owned_store(store_id, current_user, db)

    stmt = (
        select(ProductMatch)
        .join(Product, Product.id == ProductMatch.product_id)
        .where(Product.store_id == store_id, ProductMatch.status == "pending_review")
    )
    return db.execute(stmt).scalars().all()


@router.post("/matches/{match_id}/decide", response_model=ProductMatchOut)
def decide_match(
    store_id: int,
    match_id: int,
    payload: MatchDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A human confirming or rejecting a pending_review match."""
    get_owned_store(store_id, current_user, db)

    if payload.status not in {"auto_matched", "rejected"}:
        raise HTTPException(status_code=400, detail="status must be 'auto_matched' or 'rejected'")

    match = db.get(ProductMatch, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    product = db.get(Product, match.product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Match not found")

    match.status = payload.status
    db.commit()
    db.refresh(match)
    return match