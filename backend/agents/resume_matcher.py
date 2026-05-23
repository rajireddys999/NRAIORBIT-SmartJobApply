"""
Multi-Signal Resume Matcher.

Three signals combined into a 0-100 composite score:
  1. Semantic (50%) — MiniLM cosine similarity remapped from realistic range [0.25, 0.80] → [0, 100]
  2. Skill overlap (35%) — tech skill lexicon intersection (job coverage 65% + resume recall 35%)
  3. Title relevance (15%) — job title keyword presence in resume text

Short/LinkedIn job descriptions are enriched with role-typical skills before scoring
so that "Data Scientist at Google. Search keywords: data scientist." still matches a
data science resume correctly.

Score interpretation: 50+ = saved, 70+ = strong, 82+ = excellent.
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
_SEM_MIN = 0.25
_SEM_MAX = 0.80

_W_SEMANTIC = 0.50
_W_SKILLS   = 0.35
_W_TITLE    = 0.15

SAVE_THRESHOLD      = 50.0
STRONG_THRESHOLD    = 70.0
EXCELLENT_THRESHOLD = 82.0

# ── Role → typical skills map ─────────────────────────────────────────────────
# Used to enrich short job descriptions (e.g. LinkedIn 2-sentence format) so
# that skill overlap and embedding signals still work correctly.
ROLE_SKILLS: dict[str, list[str]] = {
    "data scientist": [
        "python", "machine learning", "deep learning", "statistics", "tensorflow",
        "pytorch", "sklearn", "scikit-learn", "pandas", "numpy", "sql", "nlp",
        "data analysis", "data science", "jupyter", "r", "spark", "visualization",
        "feature engineering", "regression", "classification", "clustering",
        "neural network", "xgboost", "lightgbm", "hypothesis testing",
    ],
    "data engineer": [
        "python", "sql", "apache spark", "kafka", "airflow", "etl", "elt",
        "data pipeline", "aws", "azure", "gcp", "data warehouse", "postgresql",
        "data engineering", "docker", "hadoop", "hive", "redshift", "snowflake",
        "bigquery", "dbt", "databricks", "scala", "data lake",
    ],
    "ml engineer": [
        "python", "machine learning", "deep learning", "tensorflow", "pytorch",
        "mlops", "mlflow", "docker", "kubernetes", "aws", "fastapi", "flask",
        "model serving", "data science", "sklearn", "numpy", "pandas", "rest",
    ],
    "machine learning": [
        "python", "machine learning", "deep learning", "tensorflow", "pytorch",
        "mlops", "mlflow", "docker", "kubernetes", "aws", "sklearn", "numpy",
        "pandas", "data science", "model deployment", "statistics",
    ],
    "software engineer": [
        "python", "java", "javascript", "typescript", "sql", "git", "api",
        "microservices", "docker", "kubernetes", "rest", "agile", "linux",
        "algorithms", "data structures", "system design", "testing", "ci/cd",
    ],
    "software developer": [
        "python", "java", "javascript", "sql", "git", "rest", "agile",
        "algorithms", "testing", "docker", "linux",
    ],
    "backend engineer": [
        "python", "java", "golang", "sql", "rest", "microservices", "docker",
        "kubernetes", "postgresql", "redis", "aws", "fastapi", "django",
        "spring", "nodejs", "grpc", "message queue", "celery",
    ],
    "frontend engineer": [
        "javascript", "typescript", "react", "css", "html", "nextjs", "vue",
        "angular", "webpack", "redux", "testing", "ui", "ux", "tailwind",
    ],
    "full stack": [
        "javascript", "typescript", "react", "nodejs", "python", "sql",
        "docker", "rest", "html", "css", "postgresql", "mongodb", "aws", "git",
    ],
    "devops": [
        "docker", "kubernetes", "terraform", "aws", "ci/cd", "linux", "bash",
        "jenkins", "ansible", "helm", "prometheus", "grafana", "git",
        "infrastructure", "networking", "monitoring",
    ],
    "sre": [
        "kubernetes", "docker", "aws", "linux", "python", "go", "monitoring",
        "alerting", "prometheus", "grafana", "terraform", "reliability",
        "incident response", "infrastructure",
    ],
    "cloud engineer": [
        "aws", "azure", "gcp", "terraform", "kubernetes", "docker", "linux",
        "networking", "iam", "s3", "ec2", "lambda", "serverless", "cloudformation",
    ],
    "platform engineer": [
        "kubernetes", "docker", "terraform", "aws", "ci/cd", "linux",
        "python", "helm", "devops", "infrastructure", "microservices",
    ],
    "data analyst": [
        "sql", "python", "excel", "tableau", "power bi", "statistics",
        "data analysis", "reporting", "visualization", "pandas",
        "business intelligence", "analytics", "looker",
    ],
    "analytics engineer": [
        "sql", "dbt", "python", "data warehouse", "snowflake", "bigquery",
        "redshift", "analytics", "data pipeline", "airflow",
    ],
    "business analyst": [
        "sql", "excel", "tableau", "power bi", "data analysis", "requirements",
        "stakeholder", "agile", "jira", "reporting", "business intelligence",
    ],
    "android": [
        "kotlin", "java", "android", "mobile", "rest", "sqlite",
        "firebase", "mvvm", "jetpack compose", "testing",
    ],
    "ios": [
        "swift", "ios", "xcode", "rest", "mobile", "swiftui",
        "mvvm", "testing", "objective-c",
    ],
    "mobile": [
        "swift", "kotlin", "react native", "flutter", "ios", "android",
        "mobile", "rest", "firebase",
    ],
    "qa": [
        "testing", "selenium", "cypress", "pytest", "junit", "automation",
        "manual testing", "test cases", "bug tracking", "agile",
    ],
}

# ── Tech skill lexicon ────────────────────────────────────────────────────────
_TECH_SKILLS: set[str] = {
    # Languages
    "python", "java", "javascript", "typescript", "go", "golang", "rust", "c++",
    "c#", "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl",
    "shell", "bash", "powershell", "sql", "nosql", "elixir", "haskell",
    "clojure", "groovy", "dart", "lua",
    # Frontend
    "react", "angular", "vue", "nextjs", "next.js", "svelte", "html", "css",
    "tailwind", "bootstrap", "webpack", "vite", "redux", "jquery", "sass",
    # Backend / frameworks
    "node", "nodejs", "django", "flask", "fastapi", "spring", "express",
    "rails", "laravel", "asp.net", "gin", "fiber", "nest", "nestjs",
    # Databases
    "postgresql", "postgres", "mysql", "sqlite", "mongodb", "redis", "cassandra",
    "elasticsearch", "dynamodb", "firebase", "supabase", "bigquery", "snowflake",
    "redshift", "oracle", "mssql", "cockroachdb", "neo4j", "influxdb",
    # Cloud & DevOps
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "k8s",
    "terraform", "ansible", "helm", "jenkins", "github actions", "gitlab ci",
    "circleci", "cloudformation", "serverless", "lambda", "ec2", "s3", "rds",
    "ecs", "fargate", "cloud run", "vercel", "netlify",
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
    "statistics", "hypothesis testing", "regression", "classification",
    "clustering", "feature engineering", "model deployment",
    # API & Architecture
    "rest", "graphql", "grpc", "microservices", "api", "rabbitmq", "celery",
    "message queue", "event driven", "pubsub", "mqtt", "websocket",
    # Security
    "oauth", "jwt", "ssl", "tls", "sso", "ldap", "iam", "cybersecurity",
    # Testing
    "pytest", "junit", "selenium", "cypress", "jest", "mocha", "testing",
    "unit test", "integration test", "tdd", "bdd",
    # Tools & practices
    "git", "github", "gitlab", "bitbucket", "jira", "confluence", "linux",
    "unix", "nginx", "apache", "agile", "scrum", "kanban", "ci/cd",
    # Domains
    "full stack", "fullstack", "frontend", "backend", "devops", "sre",
    "platform engineering", "site reliability",
    "data engineer", "data scientist", "ml engineer", "machine learning engineer",
    "software engineer", "backend engineer", "frontend engineer",
    "software developer", "web developer", "mobile developer", "android", "ios",
    "cloud engineer", "solutions architect",
    "data analyst", "analytics engineer", "business analyst", "qa engineer",
    "distributed systems", "high availability", "scalability",
    "algorithm", "data structures", "system design",
}

_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "for", "in", "at", "to",
    "with", "on", "is", "be", "are", "was", "were", "by", "from",
}


# ── Description enrichment ────────────────────────────────────────────────────

def enrich_description(job_title: str, description: str | None) -> str:
    """
    For short/missing descriptions (LinkedIn 2-sentence format), inject typical
    skills for the role so that skill overlap matching works correctly.
    """
    desc = (description or "").strip()
    if len(desc) > 350:
        return desc  # already rich — don't modify

    title_lower = job_title.lower()
    injected: list[str] = []

    # Longest-match first so "machine learning engineer" beats "machine learning"
    for role in sorted(ROLE_SKILLS, key=len, reverse=True):
        if role in title_lower:
            injected = ROLE_SKILLS[role]
            break

    if injected:
        skill_str = ", ".join(injected)
        return f"{desc}\nTypical skills for this role: {skill_str}."
    return desc or job_title


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


def _skill_score(resume_text: str | None, job_text_enriched: str, semantic_pct: float) -> float:
    """Skill overlap score 0-100 using the enriched job description."""
    if not resume_text:
        return semantic_pct * 0.6

    r_skills = extract_skills(resume_text)
    j_skills = extract_skills(job_text_enriched)

    if not j_skills and not r_skills:
        return semantic_pct * 0.6

    # Job coverage: fraction of job-required skills the resume has
    job_coverage = len(r_skills & j_skills) / len(j_skills) if j_skills else 0.0
    # Resume recall: fraction of resume skills that overlap
    resume_recall = len(r_skills & j_skills) / len(r_skills) if r_skills else 0.0

    return (job_coverage * 0.65 + resume_recall * 0.35) * 100


def _title_score(job_title: str, resume_text: str | None) -> float:
    """Title relevance 0-1. Exact phrase check then word overlap."""
    if not job_title or not resume_text:
        return 0.5

    jt = job_title.lower()
    rt = resume_text.lower()

    if jt in rt:
        return 1.0

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
    Short job descriptions (e.g. LinkedIn) are enriched with role-typical skills.
    """
    rich_desc = enrich_description(job_title, job_desc)

    semantic = max(0.0, min((sim - _SEM_MIN) / (_SEM_MAX - _SEM_MIN), 1.0)) * 100
    skill    = _skill_score(resume_text, rich_desc, semantic)
    title    = _title_score(job_title, resume_text) * 100

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
