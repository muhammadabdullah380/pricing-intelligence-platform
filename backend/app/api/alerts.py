from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.stores import get_owned_store
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.alert_rule import AlertRule
from app.models.user import User
from app.schemas.alert import AlertRuleCreate, AlertRuleOut, TriggeredAlertOut
from app.services.price_history import get_store_price_changes

router = APIRouter(prefix="/api/v1/stores/{store_id}", tags=["alerts"])


@router.post("/alert-rules", response_model=AlertRuleOut, status_code=status.HTTP_201_CREATED)
def create_alert_rule(
    store_id: int,
    payload: AlertRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    rule = AlertRule(
        store_id=store_id,
        metric=payload.metric,
        threshold_pct=payload.threshold_pct,
        email_enabled=payload.email_enabled,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/alert-rules", response_model=list[AlertRuleOut])
def list_alert_rules(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)
    stmt = select(AlertRule).where(AlertRule.store_id == store_id).order_by(AlertRule.created_at.desc())
    return db.execute(stmt).scalars().all()


@router.delete("/alert-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert_rule(
    store_id: int,
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)
    rule = db.get(AlertRule, rule_id)
    if not rule or rule.store_id != store_id:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    db.delete(rule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _parse_observed_at(value: str) -> datetime:
    observed_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return observed_at.replace(tzinfo=timezone.utc) if observed_at.tzinfo is None else observed_at


@router.get("/alerts", response_model=list[TriggeredAlertOut])
def list_alerts(
    store_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_store(store_id, current_user, db)

    rules = db.execute(select(AlertRule).where(AlertRule.store_id == store_id)).scalars().all()
    price_changes = get_store_price_changes(store_id, db)

    alerts = []
    for change in price_changes:
        for rule in rules:
            is_match = (
                rule.metric == "price_drop_pct"
                and change["direction"] == "decrease"
                or rule.metric == "price_increase_pct"
                and change["direction"] == "increase"
            )
            percent_change = abs(float(change["percent_change"]))
            if is_match and percent_change >= rule.threshold_pct:
                alerts.append(
                    {
                        "rule_id": rule.id,
                        "metric": rule.metric,
                        "threshold_pct": rule.threshold_pct,
                        "product_id": change["product_id"],
                        "product_title": change["product_title"],
                        "source": change["source"],
                        "percent_change": change["percent_change"],
                        "observed_at": str(change["observed_at"]),
                    }
                )

    alerts.sort(key=lambda alert: _parse_observed_at(alert["observed_at"]), reverse=True)
    return alerts