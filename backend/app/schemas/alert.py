from datetime import datetime
from typing import Literal

from pydantic import BaseModel


AlertMetric = Literal["price_drop_pct", "price_increase_pct"]


class AlertRuleCreate(BaseModel):
    metric: AlertMetric
    threshold_pct: float
    email_enabled: bool = False


class AlertRuleOut(BaseModel):
    id: int
    store_id: int
    metric: AlertMetric
    threshold_pct: float
    email_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TriggeredAlertOut(BaseModel):
    rule_id: int
    metric: AlertMetric
    threshold_pct: float
    product_id: int
    product_title: str
    source: str
    percent_change: float
    observed_at: str