from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.stores import get_owned_store
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.product import Product
from app.models.user import User
from app.schemas.product import (
    ImportCommitRequest,
    ImportPreviewResponse,
    ImportRowResult,
    ImportSummary,
    ProductOut,
)
from app.services import csv_import

router = APIRouter(prefix="/api/v1/stores/{store_id}/products", tags=["products"])


@router.post("/import/validate", response_model=ImportPreviewResponse)
async def validate_import(
    store_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported")

    contents = await file.read()
    try:
        import_id, rows = csv_import.parse_and_validate_csv(contents, store_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    valid = sum(1 for r in rows if r["status"] == "valid")
    warnings = sum(1 for r in rows if r["status"] == "warning")
    errors = sum(1 for r in rows if r["status"] == "error")

    return ImportPreviewResponse(
        summary=ImportSummary(
            import_id=import_id, total_rows=len(rows), valid=valid, warnings=warnings, errors=errors
        ),
        rows=[ImportRowResult(**r) for r in rows],
    )


@router.post("/import/commit")
def commit_import(
    store_id: int,
    payload: ImportCommitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    cached = csv_import.load_import(payload.import_id)
    if not cached or cached["store_id"] != store_id:
        raise HTTPException(status_code=404, detail="Import not found or expired. Please re-validate the file.")

    created, updated, skipped = 0, 0, 0
    for row in cached["rows"]:
        if row["status"] == "error":
            skipped += 1
            continue

        data = row["data"]
        product = None
        if data.get("sku"):
            product = db.execute(
                select(Product).where(Product.store_id == store_id, Product.sku == data["sku"])
            ).scalar_one_or_none()

        if product:
            for field, value in data.items():
                setattr(product, field, value)
            updated += 1
        else:
            product = Product(store_id=store_id, **data)
            db.add(product)
            created += 1

    db.commit()
    csv_import.delete_import(payload.import_id)

    return {"created": created, "updated": updated, "skipped": skipped}


@router.get("", response_model=list[ProductOut])
def list_products(
    store_id: int,
    q: str | None = Query(None, description="Search by title, brand, or SKU"),
    category: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    stmt = select(Product).where(Product.store_id == store_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (Product.title.ilike(like)) | (Product.brand.ilike(like)) | (Product.sku.ilike(like))
        )
    if category:
        stmt = stmt.where(Product.category == category)

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    return db.execute(stmt).scalars().all()


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    store_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)
    product = db.get(Product, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return product