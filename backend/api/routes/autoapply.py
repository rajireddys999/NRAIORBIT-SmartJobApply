"""
Auto-apply endpoint.
- Greenhouse jobs: submits via boards-api.greenhouse.io (no browser needed)
- Lever jobs: submits via api.lever.co apply form
- Others: returns the job URL so the frontend can open it
"""
import re
import uuid
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from backend.models.database import get_db
from backend.models.user import User
from backend.models.match import Match, MatchStatus
from backend.models.job import Job
from backend.models.profile import CandidateProfile
from backend.models.resume import Resume
from backend.api.deps import get_current_user
from backend.services.s3 import get_resume_bytes

router = APIRouter()

# ── Greenhouse ──────────────────────────────────────────────────────────────

_GH_URL = re.compile(
    r"https?://(?:boards|job-boards)\.greenhouse\.io/([^/]+)/jobs/(\d+)",
    re.IGNORECASE,
)

async def _apply_greenhouse(board_token: str, job_id: str, profile: CandidateProfile,
                             resume_bytes: bytes, resume_filename: str, email: str) -> dict:
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}/apply"
    data = {
        "first_name": profile.first_name or "",
        "last_name": profile.last_name or "",
        "email": email,
        "phone": profile.phone or "",
        "linkedin_profile": profile.linkedin_url or "",
        "website": profile.portfolio_url or profile.github_url or "",
    }
    files = {"resume": (resume_filename, resume_bytes, "application/pdf")}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, data=data, files=files)
    if resp.status_code in (200, 201):
        return {"method": "greenhouse_api", "status": "submitted"}
    raise RuntimeError(f"Greenhouse API returned {resp.status_code}: {resp.text[:200]}")


# ── Lever ───────────────────────────────────────────────────────────────────

_LEVER_URL = re.compile(
    r"https?://jobs\.lever\.co/([^/]+)/([^/?#]+)",
    re.IGNORECASE,
)

async def _apply_lever(company: str, posting_id: str, profile: CandidateProfile,
                       resume_bytes: bytes, resume_filename: str, email: str) -> dict:
    url = f"https://api.lever.co/v0/postings/{company}/{posting_id}/apply"
    payload = {
        "name": f"{profile.first_name or ''} {profile.last_name or ''}".strip(),
        "email": email,
        "phone": profile.phone or "",
        "org": "",
        "urls": {
            "LinkedIn": profile.linkedin_url or "",
            "GitHub": profile.github_url or "",
            "Portfolio": profile.portfolio_url or "",
        },
        "resume": {
            "name": resume_filename,
            "content": __import__("base64").b64encode(resume_bytes).decode(),
        },
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)
    if resp.status_code in (200, 201):
        return {"method": "lever_api", "status": "submitted"}
    raise RuntimeError(f"Lever API returned {resp.status_code}: {resp.text[:200]}")


# ── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/matches/{match_id}/auto-apply")
async def auto_apply(
    match_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Load match + job
    row = await db.execute(
        select(Match, Job)
        .join(Job, Match.job_id == Job.id)
        .where(and_(Match.id == uuid.UUID(match_id), Match.user_id == current_user.id))
    )
    pair = row.one_or_none()
    if not pair:
        raise HTTPException(status_code=404, detail="Match not found")
    match, job = pair

    # Load profile
    prof_row = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = prof_row.scalar_one_or_none()
    if not profile or not profile.first_name:
        raise HTTPException(status_code=400, detail="Complete your candidate profile first")

    # Load latest resume
    res_row = await db.execute(
        select(Resume)
        .where(Resume.user_id == current_user.id)
        .order_by(Resume.uploaded_at.desc())
        .limit(1)
    )
    resume = res_row.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=400, detail="Upload a resume first")

    source_url = job.source_url or ""
    result: dict = {"job_url": source_url, "method": "manual", "status": "open_url"}

    # Try to get resume bytes for API submissions
    resume_bytes: bytes = b""
    resume_filename = "resume.pdf"
    try:
        resume_bytes, resume_filename = get_resume_bytes(resume.s3_url)
    except Exception:
        pass

    if resume_bytes:
        gh = _GH_URL.match(source_url)
        lv = _LEVER_URL.match(source_url)
        try:
            if gh:
                result = await _apply_greenhouse(gh.group(1), gh.group(2), profile,
                                                  resume_bytes, resume_filename, current_user.email)
            elif lv:
                result = await _apply_lever(lv.group(1), lv.group(2), profile,
                                             resume_bytes, resume_filename, current_user.email)
        except Exception as exc:
            result = {"method": "api_failed", "error": str(exc), "job_url": source_url}

    # Mark as applied regardless of method
    match.status = MatchStatus.applied
    match.applied_at = datetime.now(timezone.utc)
    await db.commit()

    result["match_id"] = match_id
    return result
