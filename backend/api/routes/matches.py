from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.models.database import get_db
from backend.models.match import Match
from backend.models.job import Job
from backend.api.deps import get_current_user
from backend.models.user import User

router = APIRouter()


@router.get("/")
async def list_matches(
    min_score: float = Query(0.0, ge=0, le=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Match, Job)
        .join(Job, Match.job_id == Job.id)
        .where(Match.user_id == current_user.id)
        .where(Match.score >= min_score)
        .order_by(desc(Match.score))
        .offset(offset)
        .limit(page_size)
    )
    rows = result.all()
    return [
        {
            "match_id": str(m.id),
            "score": m.score,
            "status": m.status,
            "applied_at": m.applied_at,
            "job": {
                "id": str(j.id),
                "title": j.title,
                "company": j.company,
                "location": j.location,
                "source_url": j.source_url,
                "source": j.source,
            },
        }
        for m, j in rows
    ]
