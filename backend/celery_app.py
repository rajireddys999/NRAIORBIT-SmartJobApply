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
    beat_schedule={
        # All core sources every 30 min (Muse, Arbeitnow, RemoteOK,
        # Greenhouse, Lever, Ashby, Indeed).
        # LinkedIn excluded — pull manually via Admin Panel ↺ Refresh Jobs.
        "fetch-core-jobs-every-30min": {
            "task": "backend.agents.job_fetcher.fetch_core_jobs",
            "schedule": crontab(minute="*/30"),
        },
    },
)
