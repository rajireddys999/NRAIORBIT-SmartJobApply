from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.models.database import get_db
from backend.models.job import Job
from backend.api.deps import get_current_user
from backend.models.user import User

router = APIRouter()


@router.get("/")
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Job).order_by(desc(Job.fetched_at)).offset(offset).limit(page_size)
    )
    jobs = result.scalars().all()
    return [
        {
            "id": str(j.id),
            "title": j.title,
            "company": j.company,
            "location": j.location,
            "source_url": j.source_url,
            "source": j.source,
            "fetched_at": j.fetched_at,
        }
        for j in jobs
    ]


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    result = await db.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
    job = result.scalar_one_or_none()
    if not job:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": str(job.id),
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "description": job.description,
        "source_url": job.source_url,
        "source": job.source,
        "fetched_at": job.fetched_at,
    }
