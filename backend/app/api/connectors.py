from fastapi import APIRouter, Depends, HTTPException, Query

from app.connectors.registry import get_connector
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/connectors", tags=["connectors"])


@router.get("/{source}/search")
def search_connector(
    source: str,
    identifier_type: str | None = Query(None, description="e.g. upc, ean, gtin, sku"),
    identifier_value: str | None = Query(None),
    title: str | None = Query(None),
    brand: str | None = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Manual verification endpoint for Phase 3 -- lets us confirm every
    connector implements the same interface and returns the same shaped
    result, regardless of source. Not part of the production pipeline
    (that's Phase 4); this is a developer/QA utility.
    """
    connector = get_connector(source)
    if not connector:
        raise HTTPException(status_code=404, detail=f"Unknown connector source: {source}")

    if identifier_type and identifier_value:
        result = connector.search_by_identifier(identifier_type, identifier_value)
        return {"mode": "identifier", "result": result}

    if title:
        results = connector.search_by_title(title, brand)
        return {"mode": "title", "results": results}

    raise HTTPException(
        status_code=400,
        detail="Provide either (identifier_type + identifier_value) or (title)",
    )