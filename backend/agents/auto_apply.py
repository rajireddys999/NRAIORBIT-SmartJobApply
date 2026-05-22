"""
Auto-Apply Agent — triggered post-matching.

For every match above the score threshold with status=pending:
  - Marks the match as `applied` and records applied_at
  - Triggers an email notification (if SMTP is configured)

Note: actual form submission via browser automation (Playwright) is not
viable in production because job boards (LinkedIn, Indeed) use CAPTCHA
and strict bot detection. The correct UX is:
  1. AI finds and scores jobs against your resume
  2. High-score jobs are surfaced in the dashboard
  3. The user reviews and applies in one click (source_url opens the page)

This agent handles step 2 on the backend side.
"""
import uuid
from datetime import datetime, timezone

from celery import shared_task
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.match import Match, MatchStatus
from backend.models.job import Job
from backend.models.user import User


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


@celery_app.task(name="backend.agents.auto_apply.apply_pending", bind=True, max_retries=2)
def apply_pending(self, user_id: str):
    db = _get_sync_session()
    try:
        threshold = settings.match_score_threshold

        pending = db.execute(
            select(Match, Job, User)
            .join(Job, Match.job_id == Job.id)
            .join(User, User.id == Match.user_id)
            .where(and_(
                Match.user_id == uuid.UUID(user_id),
                Match.status == MatchStatus.pending,
                Match.score >= threshold,
            ))
        ).all()

        marked = 0
        for match, job, user in pending:
            match.status = MatchStatus.applied
            match.applied_at = datetime.now(timezone.utc)
            marked += 1

            celery_app.send_task(
                "backend.agents.email_notifier.send_application_email",
                args=[user_id, str(job.id), match.score],
            )

        db.commit()
        return {"marked_applied": marked}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
