"""
Email Notification Agent — triggered post-apply.
Uses smtplib (works with Gmail or any SMTP server).
If SMTP is not configured, logs to console instead — no crash.

To enable Gmail:
  1. Go to myaccount.google.com → Security → App passwords
  2. Create an app password for "SmartJobApply"
  3. Set these env vars in Railway:
       SMTP_HOST=smtp.gmail.com
       SMTP_PORT=587
       SMTP_USER=your@gmail.com
       SMTP_PASSWORD=<app-password>
       SMTP_FROM=your@gmail.com
"""
import logging
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.user import User
from backend.models.job import Job
from backend.models.notification import Notification

logger = logging.getLogger(__name__)


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password]):
        logger.info("SMTP not configured — skipping email to %s: %s", to_email, subject)
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], [to_email], msg.as_string())
        return True
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return False


def _build_html(user_name: str, job_title: str, company: str, score: float, applied_at: str) -> str:
    return f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2>Application Submitted!</h2>
      <p>Hi {user_name},</p>
      <p>SmartJobApply automatically applied on your behalf:</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Position</b></td>
            <td style="padding:8px;border:1px solid #ddd">{job_title}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Company</b></td>
            <td style="padding:8px;border:1px solid #ddd">{company}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Match Score</b></td>
            <td style="padding:8px;border:1px solid #ddd">{score:.1f}%</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><b>Applied At</b></td>
            <td style="padding:8px;border:1px solid #ddd">{applied_at}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">
        SmartJobApply — your 24/7 AI job application agent
      </p>
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
        html = _build_html(user.name, job.title, job.company, score, applied_at)
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
