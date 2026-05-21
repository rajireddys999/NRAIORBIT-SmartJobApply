"""
Auto-Apply Agent — triggered post-matching.
Uses Playwright to fill and submit job application forms for matches above threshold.
"""
import asyncio
import uuid
from datetime import datetime, timezone

from celery import shared_task
from sqlalchemy import select, and_
from sqlalchemy.orm import Session
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.match import Match, MatchStatus
from backend.models.job import Job
from backend.models.resume import Resume
from backend.models.user import User
from backend.services.s3 import get_presigned_url


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


async def _apply_to_job(job: Job, resume: Resume, user: User) -> bool:
    """
    Attempts to auto-fill and submit the job application.
    Returns True on success, False on failure.
    NOTE: Real implementation must handle CAPTCHA, auth walls, and site-specific forms.
          This scaffold handles the common Easy Apply / simple form pattern.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.goto(job.source_url, timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=15000)

            # LinkedIn Easy Apply
            easy_apply = page.locator("button:has-text('Easy Apply')")
            if await easy_apply.count() > 0:
                await easy_apply.first.click()
                await page.wait_for_timeout(2000)

                # Fill common fields
                for label, value in [
                    ("Email", user.email),
                    ("Phone", ""),  # filled from user profile when available
                    ("First name", user.name.split()[0]),
                    ("Last name", user.name.split()[-1] if len(user.name.split()) > 1 else ""),
                ]:
                    field = page.locator(f"input[aria-label*='{label}' i]")
                    if await field.count() > 0:
                        await field.first.fill(value)

                # Submit
                submit = page.locator("button:has-text('Submit application')")
                if await submit.count() > 0:
                    await submit.first.click()
                    await page.wait_for_timeout(3000)
                    return True

            # Generic form fallback
            email_field = page.locator("input[type='email']")
            if await email_field.count() > 0:
                await email_field.first.fill(user.email)
                submit = page.locator("button[type='submit']")
                if await submit.count() > 0:
                    await submit.first.click()
                    await page.wait_for_timeout(2000)
                    return True

        except PWTimeout:
            return False
        except Exception:
            return False
        finally:
            await browser.close()

    return False


@celery_app.task(name="backend.agents.auto_apply.apply_pending", bind=True, max_retries=2)
def apply_pending(self, user_id: str):
    db = _get_sync_session()
    try:
        threshold = settings.match_score_threshold

        pending = db.execute(
            select(Match, Job, Resume, User)
            .join(Job, Match.job_id == Job.id)
            .join(Resume, Resume.user_id == Match.user_id)
            .join(User, User.id == Match.user_id)
            .where(and_(
                Match.user_id == uuid.UUID(user_id),
                Match.status == MatchStatus.pending,
                Match.score >= threshold,
            ))
        ).all()

        applied, failed = 0, 0
        for match, job, resume, user in pending:
            success = asyncio.run(_apply_to_job(job, resume, user))

            match.status = MatchStatus.applied if success else MatchStatus.failed
            if success:
                match.applied_at = datetime.now(timezone.utc)
                applied += 1
                # Trigger email notification
                celery_app.send_task(
                    "backend.agents.email_notifier.send_application_email",
                    args=[user_id, str(job.id), match.score],
                )
            else:
                failed += 1

        db.commit()
        return {"applied": applied, "failed": failed}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
