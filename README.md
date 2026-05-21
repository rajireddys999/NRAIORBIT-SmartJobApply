# SmartJobApply

A 24/7 AI-powered job application platform that scrapes US job listings, matches them against registered candidate resumes, auto-applies, and sends confirmation emails.

## Quick Start (Local)

### Prerequisites
- Docker + Docker Compose
- Python 3.12+
- Node.js 20+

### 1. Clone & configure
```bash
git clone https://github.com/rajireddys999/NRAIORBIT-SmartJobApply.git
cd NRAIORBIT-SmartJobApply
cp .env.example .env
# Fill in OPENAI_API_KEY, AWS keys, SENDGRID_API_KEY
```

### 2. Start infrastructure (Postgres + Redis)
```bash
cd infra && docker-compose up postgres redis -d
```

### 3. Run backend
```bash
cd ..
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

### 4. Run Celery worker (separate terminal)
```bash
celery -A backend.celery_app.celery_app worker --loglevel=info
```

### 5. Run frontend
```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000

---

## Architecture

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 + Tailwind CSS |
| API | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 + pgvector |
| Queue | Redis + Celery |
| AI/Matching | OpenAI text-embedding-3-small |
| Scraping | Apify (Indeed / LinkedIn) |
| Email | SendGrid |
| Storage | AWS S3 |
| Hosting | GCP Cloud Run |
| CI/CD | GitHub Actions |

## Agents

1. **Job Fetcher** (`backend/agents/job_fetcher.py`) — Celery Beat, every 30 min
2. **Resume Matcher** (`backend/agents/resume_matcher.py`) — triggered on resume upload
3. **Auto-Apply** (`backend/agents/auto_apply.py`) — triggered when match score ≥ 75%
4. **Email Notifier** (`backend/agents/email_notifier.py`) — triggered post-apply

## Running Tests
```bash
pip install -r tests/requirements-test.txt
pytest tests/ -v
```

## Environment Variables

See `.env.example` for all required variables.

## Deployment

Push to `main` — GitHub Actions builds Docker images and deploys to GCP Cloud Run.
Requires `GCP_PROJECT_ID` and `GCP_SA_KEY` secrets in GitHub repository settings.
