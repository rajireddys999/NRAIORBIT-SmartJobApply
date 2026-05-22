import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_

from backend.models.database import get_db
from backend.models.match import Match, MatchStatus
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


@router.post("/{match_id}/apply")
async def apply_match(
    match_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Employee marks a specific match as applied."""
    result = await db.execute(
        select(Match).where(and_(
            Match.id == uuid.UUID(match_id),
            Match.user_id == current_user.id,
        ))
    )
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    match.status = MatchStatus.applied
    match.applied_at = datetime.now(timezone.utc)
    await db.commit()
    return {"match_id": match_id, "status": "applied"}


@router.delete("/reset")
async def reset_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all matches for the current user so matching can be re-run fresh."""
    from sqlalchemy import delete
    result = await db.execute(
        delete(Match).where(Match.user_id == current_user.id)
    )
    await db.commit()
    return {"deleted": result.rowcount}


@router.post("/apply-all")
async def apply_all_matches(
    min_score: float = Query(90.0, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Employee applies to all pending matches above min_score in one click."""
    result = await db.execute(
        select(Match).where(and_(
            Match.user_id == current_user.id,
            Match.status == MatchStatus.pending,
            Match.score >= min_score,
        ))
    )
    pending = result.scalars().all()
    now = datetime.now(timezone.utc)
    for match in pending:
        match.status = MatchStatus.applied
        match.applied_at = now
    await db.commit()
    return {"applied": len(pending)}
