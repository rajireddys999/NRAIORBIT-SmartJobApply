web:    uvicorn backend.main:app --host 0.0.0.0 --port $PORT
worker: celery -A backend.celery_app.celery_app worker --loglevel=info --concurrency=2
beat:   celery -A backend.celery_app.celery_app beat --loglevel=info
