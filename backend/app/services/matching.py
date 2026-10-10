from sqlalchemy.orm import Session

from app.connectors.registry import CONNECTORS
from app.matching.scorer import classify_confidence, score_match
from app.models.product import Product
from app.models.product_match import ProductMatch

IDENTIFIER_FIELDS = ["upc", "ean", "gtin"]


def run_matching_for_product(product: Product, db: Session) -> list[ProductMatch]:
    """For one product, ask every connector for its best guess, score each
    result against our product, and record a ProductMatch row with the
    resulting status (auto_matched / pending_review / rejected).
    """
    created_matches: list[ProductMatch] = []

    for connector in CONNECTORS.values():
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

        if not result:
            continue

        score, level = score_match(
            product,
            external_title=result.title,
            external_brand=result.brand,
            external_upc=result.raw.get("identifier_value") if result.raw.get("identifier_type") == "upc" else None,
        )
        status = classify_confidence(score)

        match = ProductMatch(
            product_id=product.id,
            source=result.source,
            external_id=result.external_id,
            external_title=result.title,
            external_brand=result.brand,
            external_price=result.price,
            external_url=result.url,
            confidence_score=score,
            match_level=level,
            status=status,
        )
        db.add(match)
        created_matches.append(match)

    db.commit()
    for m in created_matches:
        db.refresh(m)

    return created_matches