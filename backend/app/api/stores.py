from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.store import Store
from app.models.user import User
from app.schemas.store import StoreCreate, StoreOut

router = APIRouter(prefix="/api/v1/stores", tags=["stores"])


@router.post("", response_model=StoreOut, status_code=status.HTTP_201_CREATED)
def create_store(
    payload: StoreCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = Store(
        organization_id=current_user.organization_id,
        name=payload.name,
        domain=payload.domain,
        platform=payload.platform,
        currency=payload.currency,
        country=payload.country,
        status="active",
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.get("", response_model=list[StoreOut])
def list_stores(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Store).where(Store.organization_id == current_user.organization_id)
    return db.execute(stmt).scalars().all()


def get_owned_store(store_id: int, current_user: User, db: Session) -> Store:
    """Shared helper: confirms a store exists AND belongs to the caller's
    organization, so one tenant can never touch another tenant's data."""
    store = db.execute(select(Store).where(Store.id == store_id)).scalar_one_or_none()
    if not store or store.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Store not found")
    return store