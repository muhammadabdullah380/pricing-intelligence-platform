from datetime import timedelta

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "pricing_intelligence",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    beat_schedule={
        "schedule-price-pipeline-every-six-hours": {
            "task": "schedule_store_price_pipeline",
            "schedule": timedelta(hours=6),
        },
    },
)

celery_app.autodiscover_tasks(["app.workers"])