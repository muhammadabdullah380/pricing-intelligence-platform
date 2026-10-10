from pydantic import BaseModel


class OpportunityOut(BaseModel):
    product_id: int
    product_title: str
    opportunity_type: str
    our_price: float
    market_median: float
    diff_pct: float
    currency: str


class CompetitorSummaryOut(BaseModel):
    source: str
    matched_products: int
    avg_price_diff_pct: float | None
    cheaper_products: int
    more_expensive_products: int
    price_increases: int
    price_decreases: int
    last_seen: str | None


class DataQualityOut(BaseModel):
    total_products: int
    products_missing_market_data: int
    pending_matches: int
    per_source_last_check: dict[str, str | None]