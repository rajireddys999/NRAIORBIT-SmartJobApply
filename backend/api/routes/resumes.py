import logging
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.database import get_db
from backend.models.user import User
from backend.models.resume import Resume
from backend.api.deps import get_current_user
from backend.services.s3 import upload_resume, get_presigned_url
from backend.services.resume_parser import parse_pdf_bytes
from backend.services.embeddings import embed

logger = logging.getLogger(__name__)
router = APIRouter()


def _filename_from_url(s3_url: str) -> str:
    return s3_url.rsplit("/", 1)[-1] if "/" in s3_url else "resume.pdf"


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are accepted")

    raw = await file.read()

    filename = file.filename or "resume.pdf"
    try:
        s3_url = upload_resume(raw, filename, str(current_user.id))
    except Exception as exc:
        logger.warning("Resume storage skipped (Supabase unavailable): %s", exc)
        s3_url = f"local://{current_user.id}/{filename}"

    parsed_text = parse_pdf_bytes(raw)
    embedding = await embed(parsed_text)

    resume = Resume(
        user_id=current_user.id,
        s3_url=s3_url,
        parsed_text=parsed_text,
        embedding=embedding,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    from backend.celery_app import celery_app
    task = celery_app.send_task(
        "backend.agents.resume_matcher.run_matching",
        args=[str(current_user.id), str(resume.id)],
    )

    return {
        "id": str(resume.id),
        "filename": filename,
        "task_id": task.id,
        "uploaded_at": resume.uploaded_at,
    }


@router.get("/task/{task_id}")
async def match_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll Celery matching task state — accessible to any authenticated user."""
    from backend.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    state = result.state
    payload: dict = {"task_id": task_id, "state": state}
    if state == "SUCCESS":
        payload["result"] = result.result
    elif state == "FAILURE":
        exc = result.result
        payload["error"] = str(exc) if exc else "Unknown error"
    elif state == "PROGRESS":
        payload["meta"] = result.info  # dict with scanned/total/matched/strong/status
    return payload


@router.post("/{resume_id}/retry-matching")
async def retry_matching(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-trigger the matching Celery task for an existing resume."""
    result = await db.execute(
        select(Resume).where(
            Resume.id == uuid.UUID(resume_id),
            Resume.user_id == current_user.id,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if resume.embedding is None:
        raise HTTPException(status_code=400, detail="Resume has no embedding — please re-upload")

    from backend.celery_app import celery_app
    task = celery_app.send_task(
        "backend.agents.resume_matcher.run_matching",
        args=[str(current_user.id), str(resume.id)],
    )
    return {"task_id": task.id}


@router.get("/")
async def list_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume)
        .where(Resume.user_id == current_user.id)
        .order_by(Resume.uploaded_at.desc())
    )
    resumes = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "filename": _filename_from_url(r.s3_url),
            "download_url": get_presigned_url(r.s3_url),
            "uploaded_at": r.uploaded_at,
            "has_embedding": r.embedding is not None,
        }
        for r in resumes
    ]


@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(
            Resume.id == uuid.UUID(resume_id),
            Resume.user_id == current_user.id,
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    await db.delete(resume)
    await db.commit()
    return {"deleted": resume_id}
