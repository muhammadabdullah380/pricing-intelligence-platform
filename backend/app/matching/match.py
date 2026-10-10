from pydantic import BaseModel


class ProductMatchOut(BaseModel):
    id: int
    product_id: int
    source: str
    external_id: str | None
    external_title: str
    external_brand: str | None
    external_price: float | None
    external_url: str | None
    confidence_score: float
    match_level: str
    status: str

    class Config:
        from_attributes = True


class MatchDecisionRequest(BaseModel):
    status: str  # "auto_matched" or "rejected" -- the human's decision