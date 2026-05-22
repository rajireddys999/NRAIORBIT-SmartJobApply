from celery import Celery
from celery.schedules import crontab

from backend.config import settings

celery_app = Celery(
    "smartjobapply",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "backend.agents.job_fetcher",
        "backend.agents.resume_matcher",
        "backend.agents.auto_apply",
        "backend.agents.email_notifier",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # All schedules disabled — use Admin Panel ↺ Refresh Jobs to fetch manually.
    # To re-enable: uncomment and redeploy worker + beat services.
    # beat_schedule={
    #     "fetch-core-jobs-every-30min": {
    #         "task": "backend.agents.job_fetcher.fetch_core_jobs",
    #         "schedule": crontab(minute="*/30"),
    #     },
    # },
    beat_schedule={},
)
