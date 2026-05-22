"""
Multi-Signal Resume Matcher.

Three signals combined into a 0-100 composite score:
  1. Semantic (50%) — MiniLM cosine similarity remapped from realistic range [0.30, 0.85] → [0, 100]
  2. Skill overlap (35%) — tech skill lexicon intersection (job coverage 65% + resume recall 35%)
  3. Title relevance (15%) — job title keyword presence in resume text

Score interpretation: 75+ = saved match, 85+ = strong, 93+ = excellent.
"""
import uuid
import numpy as np
from sqlalchemy import select, and_

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.resume import Resume
from backend.models.job import Job
from backend.models.match import Match, MatchStatus

# ── Scoring constants ─────────────────────────────────────────────────────────
# MiniLM-L6-v2 cosine similarities for tech documents cluster around 0.55-0.70.
# Remapping [0.25, 0.80] → [0, 100] makes the semantic signal span the full range.
_SEM_MIN = 0.25
_SEM_MAX = 0.80

_W_SEMANTIC = 0.50
_W_SKILLS   = 0.35
_W_TITLE    = 0.15

# Calibrated to MiniLM realistic output: genuine matches score 55-75%, great matches 75-90%
SAVE_THRESHOLD      = 50.0   # save to DB
STRONG_THRESHOLD    = 70.0   # marked strong
EXCELLENT_THRESHOLD = 82.0   # excellent/top match

# ── Tech skill lexicon ────────────────────────────────────────────────────────
_TECH_SKILLS: set[str] = {
    # Languages
    "python", "java", "javascript", "typescript", "go", "golang", "rust", "c++",
    "c#", "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl",
    "shell", "bash", "powershell", "sql", "nosql", "cobol", "fortran", "elixir",
    "haskell", "clojure", "groovy", "dart", "lua",
    # Frontend
    "react", "angular", "vue", "nextjs", "next.js", "svelte", "html", "css",
    "tailwind", "bootstrap", "webpack", "vite", "redux", "jquery", "sass",
    # Backend / frameworks
    "node", "nodejs", "django", "flask", "fastapi", "spring", "express",
    "rails", "laravel", "asp.net", "gin", "fiber", "actix", "rocket",
    "nest", "nestjs", "hapi", "koa", "sinatra",
    # Databases
    "postgresql", "postgres", "mysql", "sqlite", "mongodb", "redis", "cassandra",
    "elasticsearch", "dynamodb", "firebase", "supabase", "bigquery", "snowflake",
    "redshift", "oracle", "mssql", "cockroachdb", "neo4j", "influxdb", "couchdb",
    # Cloud & DevOps
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "k8s",
    "terraform", "ansible", "helm", "jenkins", "github actions", "gitlab ci",
    "circleci", "cloudformation", "serverless", "lambda", "ec2", "s3", "rds",
    "ecs", "fargate", "cloud run", "cloud functions", "vercel", "netlify",
    "prometheus", "grafana", "datadog", "new relic", "splunk",
    # Data & ML
    "machine learning", "deep learning", "nlp", "computer vision", "llm",
    "tensorflow", "pytorch", "keras", "sklearn", "scikit-learn", "pandas",
    "numpy", "spark", "apache spark", "kafka", "airflow", "dbt", "flink",
    "hadoop", "hive", "presto", "mlflow", "ray", "huggingface", "langchain",
    "xgboost", "lightgbm", "catboost", "statsmodels", "scipy",
    "data engineering", "data science", "data analysis", "analytics",
    "etl", "elt", "data pipeline", "data warehouse", "data lake",
    "power bi", "tableau", "looker", "metabase", "superset",
    # API & Architecture
    "rest", "graphql", "grpc", "microservices", "api", "rabbitmq", "celery",
    "message queue", "event driven", "pubsub", "mqtt", "websocket",
    # Security
    "oauth", "jwt", "ssl", "tls", "sso", "ldap", "iam", "penetration testing",
    "cybersecurity", "soc", "siem", "firewalls", "encryption",
    # Testing
    "pytest", "junit", "selenium", "cypress", "jest", "mocha", "testing",
    "unit test", "integration test", "tdd", "bdd", "load testing",
    # Tools & practices
    "git", "github", "gitlab", "bitbucket", "jira", "confluence", "linux",
    "unix", "nginx", "apache", "agile", "scrum", "kanban", "ci/cd",
    # Domains / job function keywords
    "full stack", "fullstack", "frontend", "backend", "devops", "sre",
    "platform engineering", "site reliability", "data engineer", "data scientist",
    "ml engineer", "software engineer", "backend engineer", "frontend engineer",
    "software developer", "web developer", "mobile developer", "android", "ios",
    "cloud engineer", "solutions architect", "technical lead", "tech lead",
    "product manager", "project manager", "business analyst", "qa engineer",
    "systems design", "distributed systems", "high availability", "scalability",
    "performance optimization", "algorithm", "data structures",
}

_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "for", "in", "at", "to",
    "with", "on", "is", "be", "are", "was", "were", "by", "from",
}


# ── Signal functions ──────────────────────────────────────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a, dtype=float), np.array(b, dtype=float)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom else 0.0


def extract_skills(text: str) -> set[str]:
    """Return skill tokens found in text using the lexicon."""
    if not text:
        return set()
    t = text.lower()
    return {skill for skill in _TECH_SKILLS if skill in t}


def _skill_score(resume_text: str | None, job_text: str | None, semantic_pct: float) -> float:
    """Skill overlap score 0-100. Falls back to semantic proxy when text is absent."""
    if not resume_text or not job_text:
        return semantic_pct * 0.6  # conservative fallback

    r_skills = extract_skills(resume_text)
    j_skills = extract_skills(job_text)

    if not j_skills and not r_skills:
        return semantic_pct * 0.6

    # Job coverage: how many of the job's required skills does the resume have?
    job_coverage = len(r_skills & j_skills) / len(j_skills) if j_skills else 0.0
    # Resume recall: how much of the resume's skill set matches the job?
    resume_recall = len(r_skills & j_skills) / len(r_skills) if r_skills else 0.0

    return (job_coverage * 0.65 + resume_recall * 0.35) * 100


def _title_score(job_title: str, resume_text: str | None) -> float:
    """Title relevance 0-1. Checks substring presence and word overlap."""
    if not job_title or not resume_text:
        return 0.5  # neutral when no data

    jt = job_title.lower()
    rt = resume_text.lower()

    # Exact title phrase in resume
    if jt in rt:
        return 1.0

    # Word-level overlap (remove stopwords)
    jt_words = set(jt.split()) - _STOPWORDS
    rt_words = set(rt.split())
    if not jt_words:
        return 0.5

    return min(len(jt_words & rt_words) / len(jt_words), 1.0)


def composite_score(
    sim: float,
    resume_text: str | None,
    job_desc: str | None,
    job_title: str,
) -> float:
    """
    Multi-signal composite score 0-100.

    75+ = saved match, 85+ = strong, 93+ = excellent.
    """
    # Signal 1: semantic — remap MiniLM realistic range to 0-100
    semantic = max(0.0, min((sim - _SEM_MIN) / (_SEM_MAX - _SEM_MIN), 1.0)) * 100

    # Signal 2: skill lexicon overlap
    skill = _skill_score(resume_text, job_desc, semantic)

    # Signal 3: title relevance
    title = _title_score(job_title, resume_text) * 100

    final = _W_SEMANTIC * semantic + _W_SKILLS * skill + _W_TITLE * title
    return round(min(final, 100.0), 2)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


# ── Celery task ───────────────────────────────────────────────────────────────

@celery_app.task(name="backend.agents.resume_matcher.run_matching", bind=True, max_retries=3)
def run_matching(self, user_id: str, resume_id: str):
    db = _get_sync_session()
    try:
        resume = db.get(Resume, uuid.UUID(resume_id))
        if not resume or resume.embedding is None:
            return {"error": "Resume not found or missing embedding"}

        jobs = db.execute(select(Job).where(Job.embedding.isnot(None))).scalars().all()
        total = len(jobs)
        matched = 0
        strong = 0

        self.update_state(state="PROGRESS", meta={
            "scanned": 0, "total": total, "matched": 0, "strong": 0,
            "status": f"Starting multi-signal analysis — {total} jobs…",
        })

        for i, job in enumerate(jobs):
            if job.embedding is None:
                continue

            sim = _cosine_similarity(resume.embedding, job.embedding)
            score = composite_score(sim, resume.parsed_text, job.description, job.title)

            if score < SAVE_THRESHOLD:
                # Report progress even for skipped jobs
                if (i + 1) % 25 == 0:
                    self.update_state(state="PROGRESS", meta={
                        "scanned": i + 1, "total": total,
                        "matched": matched, "strong": strong,
                        "status": f"Scanned {i + 1}/{total} — {matched} matched, {strong} strong",
                    })
                continue

            existing = db.execute(
                select(Match).where(and_(
                    Match.user_id == uuid.UUID(user_id),
                    Match.job_id == job.id,
                ))
            ).scalar_one_or_none()

            if existing:
                existing.score = score
            else:
                db.add(Match(
                    user_id=uuid.UUID(user_id),
                    job_id=job.id,
                    score=score,
                    status=MatchStatus.pending,
                ))
                matched += 1

            if score >= STRONG_THRESHOLD:
                strong += 1

            if (i + 1) % 25 == 0 or i == total - 1:
                db.flush()
                self.update_state(state="PROGRESS", meta={
                    "scanned": i + 1, "total": total,
                    "matched": matched, "strong": strong,
                    "status": f"Scanned {i + 1}/{total} — {matched} matched, {strong} strong",
                })

        db.commit()
        return {"matched": matched, "total_jobs": total, "strong": strong}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()
