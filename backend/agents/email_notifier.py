"""
Email Notification Agent — triggered post-apply.
Sends confirmation emails via SendGrid.
"""
import uuid
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from celery import shared_task
from sqlalchemy import select

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.user import User
from backend.models.job import Job
from backend.models.notification import Notification
from datetime import datetime, timezone


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    if not settings.sendgrid_api_key:
        return False
    try:
        sg = SendGridAPIClient(settings.sendgrid_api_key)
        message = Mail(
            from_email=settings.sendgrid_from_email,
            to_emails=to_email,
            subject=subject,
            html_content=html_body,
        )
        response = sg.send(message)
        return response.status_code in (200, 202)
    except Exception:
        return False


def _build_email_html(user_name: str, job_title: str, company: str, score: float, applied_at: str) -> str:
    return f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2>Application Submitted!</h2>
      <p>Hi {user_name},</p>
      <p>SmartJobApply automatically applied on your behalf to:</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Position</b></td><td style="padding:8px;border:1px solid #ddd">{job_title}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Company</b></td><td style="padding:8px;border:1px solid #ddd">{company}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Match Score</b></td><td style="padding:8px;border:1px solid #ddd">{score:.1f}%</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Applied At</b></td><td style="padding:8px;border:1px solid #ddd">{applied_at}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">SmartJobApply — your 24/7 AI job application agent</p>
    </body></html>
    """


@celery_app.task(name="backend.agents.email_notifier.send_application_email", bind=True, max_retries=3)
def send_application_email(self, user_id: str, job_id: str, score: float):
    db = _get_sync_session()
    try:
        user = db.get(User, uuid.UUID(user_id))
        job = db.get(Job, uuid.UUID(job_id))
        if not user or not job:
            return {"error": "User or job not found"}

        applied_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        html = _build_email_html(user.name, job.title, job.company, score, applied_at)
        sent = _send_email(user.email, f"Applied: {job.title} at {job.company}", html)

        notif = Notification(
            user_id=uuid.UUID(user_id),
            job_id=uuid.UUID(job_id),
            type="applied",
            email_sent_at=datetime.now(timezone.utc) if sent else None,
        )
        db.add(notif)
        db.commit()

        return {"sent": sent, "to": user.email}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()
