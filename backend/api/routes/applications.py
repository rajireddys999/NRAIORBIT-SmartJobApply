from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.models.database import get_db
from backend.models.match import Match, MatchStatus
from backend.models.job import Job
from backend.api.deps import get_current_user
from backend.models.user import User

router = APIRouter()


@router.get("/")
async def list_applications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Match, Job)
        .join(Job, Match.job_id == Job.id)
        .where(Match.user_id == current_user.id)
        .where(Match.status == MatchStatus.applied)
        .order_by(desc(Match.applied_at))
    )
    rows = result.all()
    return [
        {
            "match_id": str(m.id),
            "score": m.score,
            "applied_at": m.applied_at,
            "job": {
                "id": str(j.id),
                "title": j.title,
                "company": j.company,
                "location": j.location,
                "source_url": j.source_url,
            },
        }
        for m, j in rows
    ]
