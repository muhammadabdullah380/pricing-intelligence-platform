from types import SimpleNamespace

from sqlalchemy import select

from app.api import alerts as alerts_api
from app.api import pipeline as pipeline_api
from app.models.alert_rule import AlertRule
from app.models.product import Product


def test_product_price_routes_hide_products_from_other_stores(client, tenant):
    store_id = tenant["store_id"]
    other_product_id = tenant["other_product_id"]
    paths = [
        f"/api/v1/stores/{store_id}/products/{other_product_id}/price-history",
        f"/api/v1/stores/{store_id}/products/{other_product_id}/price-changes",
        f"/api/v1/stores/{store_id}/products/{other_product_id}/observations",
    ]

    for path in paths:
        response = client.get(path)
        assert response.status_code == 404
        assert response.json()["detail"] == "Product not found"


def test_csv_import_validate_preview_and_commit(client, tenant, session_factory, monkeypatch):
    class MemoryRedis:
        def __init__(self):
            self.values = {}

        def set(self, key, value, ex=None):
            self.values[key] = value

        def get(self, key):
            return self.values.get(key)

        def delete(self, key):
            self.values.pop(key, None)

    from app.services import csv_import

    monkeypatch.setattr(csv_import, "_redis", MemoryRedis())
    store_id = tenant["store_id"]
    response = client.post(
        f"/api/v1/stores/{store_id}/products/import/validate",
        files={"file": ("catalog.csv", b"Product Name,SKU,Price\nNew item,SKU-NEW,24.50\n", "text/csv")},
    )

    assert response.status_code == 200
    preview = response.json()
    assert preview["summary"]["total_rows"] == 1
    assert preview["summary"]["valid"] == 1
    assert preview["rows"][0]["data"]["title"] == "New item"

    commit = client.post(
        f"/api/v1/stores/{store_id}/products/import/commit",
        json={"import_id": preview["summary"]["import_id"]},
    )
    assert commit.status_code == 200
    assert commit.json() == {"created": 1, "updated": 0, "skipped": 0}

    with session_factory() as db:
        imported = db.execute(
            select(Product).where(Product.store_id == store_id, Product.sku == "SKU-NEW")
        ).scalar_one()
        assert imported.title == "New item"


def test_alert_rule_create_evaluate_and_delete(client, tenant, monkeypatch):
    store_id = tenant["store_id"]
    create = client.post(
        f"/api/v1/stores/{store_id}/alert-rules",
        json={"metric": "price_drop_pct", "threshold_pct": 10, "email_enabled": False},
    )
    assert create.status_code == 201
    rule = create.json()

    monkeypatch.setattr(
        alerts_api,
        "get_store_price_changes",
        lambda _store_id, _db: [
            {
                "product_id": tenant["product_id"],
                "product_title": "Own product",
                "source": "amazon",
                "direction": "decrease",
                "percent_change": -12.5,
                "observed_at": "2026-10-10T12:00:00+00:00",
            }
        ],
    )
    evaluated = client.get(f"/api/v1/stores/{store_id}/alerts")
    assert evaluated.status_code == 200
    assert evaluated.json() == [
        {
            "rule_id": rule["id"],
            "metric": "price_drop_pct",
            "threshold_pct": 10.0,
            "product_id": tenant["product_id"],
            "product_title": "Own product",
            "source": "amazon",
            "percent_change": -12.5,
            "observed_at": "2026-10-10T12:00:00+00:00",
        }
    ]

    deleted = client.delete(f"/api/v1/stores/{store_id}/alert-rules/{rule['id']}")
    assert deleted.status_code == 204
    remaining = client.get(f"/api/v1/stores/{store_id}/alert-rules")
    assert remaining.status_code == 200
    assert remaining.json() == []


def test_manual_pipeline_dispatches_product_tasks(client, tenant, monkeypatch):
    dispatched = []

    def fake_delay(product_id):
        dispatched.append(product_id)
        return SimpleNamespace(id=f"task-{product_id}")

    monkeypatch.setattr(pipeline_api.fetch_prices_for_product, "delay", fake_delay)
    response = client.post(f"/api/v1/stores/{tenant['store_id']}/pipeline/run")

    assert response.status_code == 200
    assert response.json() == {
        "dispatched": 1,
        "task_ids": [f"task-{tenant['product_id']}"],
    }
    assert dispatched == [tenant["product_id"]]