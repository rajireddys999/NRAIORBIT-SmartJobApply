#!/bin/sh
# Reads APP_MODE env var set per-service in Railway.
# backend (default): uvicorn API server
# worker:            Celery task worker
# beat:              Celery Beat scheduler
case "$APP_MODE" in
  worker)
    exec celery -A backend.celery_app.celery_app worker --loglevel=info --concurrency=2
    ;;
  beat)
    exec celery -A backend.celery_app.celery_app beat --loglevel=info
    ;;
  *)
    exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
    ;;
esac
