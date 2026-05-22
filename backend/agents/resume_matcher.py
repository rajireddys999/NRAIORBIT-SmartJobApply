"""
Resume Matcher Agent — triggered when a new resume is uploaded.
Computes cosine similarity between resume embedding and all job embeddings.
Reports live progress via Celery task state so the frontend can poll it.
"""
import uuid
import numpy as np
from sqlalchemy import select, and_

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.resume import Resume
from backend.models.job import Job
from backend.models.match import Match, MatchStatus


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


def _score_to_percent(sim: float) -> float:
    return round((sim + 1) / 2 * 100, 2)


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
        strong = 0  # score >= 75

        self.update_state(state="PROGRESS", meta={
            "scanned": 0, "total": total, "matched": 0, "strong": 0,
            "status": f"Starting — scanning {total} jobs…",
        })

        for i, job in enumerate(jobs):
            score = _score_to_percent(_cosine_similarity(resume.embedding, job.embedding))

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

            if score >= 75:
                strong += 1

            # Report progress every 25 jobs
            if (i + 1) % 25 == 0 or i == total - 1:
                db.flush()
                self.update_state(state="PROGRESS", meta={
                    "scanned": i + 1,
                    "total": total,
                    "matched": matched,
                    "strong": strong,
                    "status": f"Scanned {i + 1}/{total} jobs — {strong} strong matches so far",
                })

        db.commit()
        return {"matched": matched, "total_jobs": total, "strong": strong}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()
