from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.stores import get_owned_store
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.product import Product
from app.models.product_match import ProductMatch
from app.models.user import User
from app.schemas.competitive import CompetitorSummaryOut, DataQualityOut, OpportunityOut
from app.services.competitive import get_competitive_position
from app.services.price_history import get_store_price_changes

router = APIRouter(prefix="/api/v1/stores/{store_id}", tags=["competitive"])


@router.get("/products/{product_id}/competitive-position")
def competitive_position(
    store_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    product = db.get(Product, product_id)
    if not product or product.store_id != store_id:
        raise HTTPException(status_code=404, detail="Product not found")

    our_price = float(product.list_price) if product.list_price is not None else None
    return get_competitive_position(product_id, our_price)


@router.get("/opportunities", response_model=list[OpportunityOut])
def list_opportunities(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    store = get_owned_store(store_id, current_user, db)
    products = db.execute(select(Product).where(Product.store_id == store_id)).scalars().all()

    results = []
    for product in products:
        our_price = float(product.list_price) if product.list_price is not None else None
        position = get_competitive_position(product.id, our_price)
        market_median = position["market_median"]

        if (
            position["position"] in {"at_market", "no_market_data", "no_own_price"}
            or our_price is None
            or market_median is None
            or market_median == 0
        ):
            continue

        market_median = float(market_median)
        diff_pct = (our_price - market_median) / market_median * 100
        if abs(diff_pct) < 5:
            continue

        results.append(
            {
                "product_id": product.id,
                "product_title": product.title,
                "opportunity_type": "price_too_high" if diff_pct > 0 else "price_too_low",
                "our_price": our_price,
                "market_median": market_median,
                "diff_pct": diff_pct,
                "currency": product.currency or store.currency or "USD",
            }
        )

    results.sort(key=lambda opportunity: abs(opportunity["diff_pct"]), reverse=True)
    return results


@router.get("/competitors", response_model=list[CompetitorSummaryOut])
def list_competitors(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    matches_stmt = (
        select(ProductMatch, Product)
        .join(Product, Product.id == ProductMatch.product_id)
        .where(Product.store_id == store_id, ProductMatch.status == "auto_matched")
        .order_by(ProductMatch.created_at.desc(), ProductMatch.id.desc())
    )
    match_rows = db.execute(matches_stmt).all()

    # Repeated matching runs can create multiple confirmed rows for a product/source.
    matches_by_source: dict[str, dict[int, tuple[ProductMatch, Product]]] = {}
    for match, product in match_rows:
        matches_by_source.setdefault(match.source, {}).setdefault(product.id, (match, product))

    changes_by_source: dict[str, list[dict]] = {}
    for change in get_store_price_changes(store_id, db):
        changes_by_source.setdefault(change["source"], []).append(change)

    sources = set(matches_by_source) | set(changes_by_source)
    summaries = []
    for source in sources:
        matched_products = matches_by_source.get(source, {})
        price_differences = []
        cheaper_products = 0
        more_expensive_products = 0

        for match, product in matched_products.values():
            external_price = float(match.external_price) if match.external_price is not None else None
            our_price = float(product.list_price) if product.list_price is not None else None
            if external_price is None or our_price is None:
                continue
            if external_price < our_price:
                cheaper_products += 1
            elif external_price > our_price:
                more_expensive_products += 1
            if our_price != 0:
                price_differences.append((external_price - our_price) / our_price * 100)

        changes = changes_by_source.get(source, [])
        observed_times = []
        for change in changes:
            observed_at = datetime.fromisoformat(str(change["observed_at"]).replace("Z", "+00:00"))
            if observed_at.tzinfo is None:
                observed_at = observed_at.replace(tzinfo=timezone.utc)
            observed_times.append(observed_at)

        latest_seen = max(observed_times).isoformat() if observed_times else None
        summaries.append(
            {
                "source": source,
                "matched_products": len(matched_products),
                "avg_price_diff_pct": (
                    sum(price_differences) / len(price_differences) if price_differences else None
                ),
                "cheaper_products": cheaper_products,
                "more_expensive_products": more_expensive_products,
                "price_increases": sum(change["direction"] == "increase" for change in changes),
                "price_decreases": sum(change["direction"] == "decrease" for change in changes),
                "last_seen": latest_seen,
            }
        )

    summaries.sort(key=lambda summary: summary["matched_products"], reverse=True)
    return summaries


@router.get("/data-quality", response_model=DataQualityOut)
def data_quality(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    products = db.execute(select(Product).where(Product.store_id == store_id)).scalars().all()
    products_missing_market_data = 0
    for product in products:
        our_price = float(product.list_price) if product.list_price is not None else None
        position = get_competitive_position(product.id, our_price)
        if position["position"] in {"no_market_data", "no_own_price"}:
            products_missing_market_data += 1

    pending_stmt = (
        select(func.count(ProductMatch.id))
        .join(Product, Product.id == ProductMatch.product_id)
        .where(Product.store_id == store_id, ProductMatch.status == "pending_review")
    )
    pending_matches = db.execute(pending_stmt).scalar_one()

    sources = ("amazon", "walmart", "bestbuy")
    per_source_last_check: dict[str, str | None] = {source: None for source in sources}
    latest_by_source: dict[str, datetime] = {}
    for change in get_store_price_changes(store_id, db):
        source = change["source"]
        if source not in per_source_last_check:
            continue

        observed_at = datetime.fromisoformat(str(change["observed_at"]).replace("Z", "+00:00"))
        if observed_at.tzinfo is None:
            observed_at = observed_at.replace(tzinfo=timezone.utc)

        if source not in latest_by_source or observed_at > latest_by_source[source]:
            latest_by_source[source] = observed_at
            per_source_last_check[source] = observed_at.isoformat()

    return DataQualityOut(
        total_products=len(products),
        products_missing_market_data=products_missing_market_data,
        pending_matches=pending_matches,
        per_source_last_check=per_source_last_check,
    )