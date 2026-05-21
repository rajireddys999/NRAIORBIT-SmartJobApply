# AWS Architecture — NRAIORBIT SmartJobApply

```
GitHub (main push)
       │
       └── GitHub Actions
             ├── Build & push Docker → ECR
             ├── Deploy backend  → App Runner   (FastAPI :8000)
             ├── Deploy worker   → ECS Fargate  (Celery worker)
             ├── Deploy beat     → ECS Fargate  (Celery beat)
             └── Deploy frontend → Amplify      (Next.js)

AWS Services:
  ECR          — Docker image registry
  App Runner   — FastAPI backend (auto-scale, HTTPS)
  ECS Fargate  — Celery worker + beat (always-on containers)
  RDS          — PostgreSQL 16 (db.t3.micro)
  ElastiCache  — Redis 7 (cache.t3.micro)
  S3           — Resume PDF storage
  Amplify      — Frontend hosting + CI/CD
  IAM          — Service roles
  VPC          — Private networking (RDS + ElastiCache not public)
  Secrets Mgr  — API keys (OpenAI, SendGrid, Apify)
```
