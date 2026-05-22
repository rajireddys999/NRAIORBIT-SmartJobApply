"""
Resume Matcher Agent — triggered when a new resume is uploaded or new jobs arrive.
Computes cosine similarity between resume embedding and all job embeddings.
Stores match scores in the matches table.
"""
import asyncio
import uuid
import numpy as np
from celery import shared_task
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

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
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


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
        matched = 0

        for job in jobs:
            existing = db.execute(
                select(Match).where(and_(
                    Match.user_id == uuid.UUID(user_id),
                    Match.job_id == job.id,
                ))
            ).scalar_one_or_none()

            score = _score_to_percent(_cosine_similarity(resume.embedding, job.embedding))

            if existing:
                existing.score = score
            else:
                match = Match(
                    user_id=uuid.UUID(user_id),
                    job_id=job.id,
                    score=score,
                    status=MatchStatus.pending,
                )
                db.add(match)
                matched += 1

        db.commit()
        return {"matched": matched, "total_jobs": len(jobs)}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()
