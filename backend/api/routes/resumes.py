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

router = APIRouter()


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are accepted")

    raw = await file.read()
    s3_url = upload_resume(file, str(current_user.id))
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

    # Trigger async matching in background
    from backend.celery_app import celery_app
    celery_app.send_task("backend.agents.resume_matcher.run_matching", args=[str(current_user.id), str(resume.id)])

    return {"id": str(resume.id), "s3_url": resume.s3_url, "uploaded_at": resume.uploaded_at}


@router.get("/")
async def list_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.uploaded_at.desc()))
    resumes = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "download_url": get_presigned_url(r.s3_url),
            "uploaded_at": r.uploaded_at,
            "has_embedding": r.embedding is not None,
        }
        for r in resumes
    ]
