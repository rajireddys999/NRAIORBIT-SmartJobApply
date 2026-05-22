"""Admin-only routes — require role=admin."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from backend.models.database import get_db
from backend.models.user import User
from backend.models.job import Job
from backend.models.match import Match
from backend.api.deps import require_admin

router = APIRouter()


@router.get("/users")
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot change admin status")
    user.status = "active"
    await db.commit()
    return {"id": str(user.id), "status": "active"}


@router.post("/users/{user_id}/revoke")
async def revoke_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot revoke admin access")
    user.status = "revoked"
    await db.commit()
    return {"id": str(user.id), "status": "revoked"}


@router.get("/task/{task_id}")
async def task_status(task_id: str, admin: User = Depends(require_admin)):
    """Poll Celery task state by ID — used by admin refresh status indicator."""
    from backend.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    state = result.state  # PENDING | STARTED | SUCCESS | FAILURE | RETRY
    payload: dict = {"task_id": task_id, "state": state}
    if state == "SUCCESS":
        payload["result"] = result.result  # {"fetched": N, "saved": N, "source": "..."}
    elif state == "FAILURE":
        payload["error"] = str(result.result)
    return payload


@router.get("/stats")
async def admin_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = await db.scalar(select(func.count()).where(User.role == "employee"))
    pending = await db.scalar(select(func.count()).where(User.status == "pending", User.role == "employee"))
    active = await db.scalar(select(func.count()).where(User.status == "active", User.role == "employee"))
    revoked = await db.scalar(select(func.count()).where(User.status == "revoked", User.role == "employee"))
    total_jobs = await db.scalar(select(func.count(Job.id)))
    total_applications = await db.scalar(select(func.count(Match.id)).where(Match.status == "applied"))
    return {
        "total_employees": total_users,
        "pending": pending,
        "active": active,
        "revoked": revoked,
        "total_jobs": total_jobs,
        "total_applications": total_applications,
    }


@router.get("/applications")
async def all_applications(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """All applications across all employees — admin oversight view."""
    from backend.models.job import Job
    result = await db.execute(
        select(Match, Job, User)
        .join(Job, Match.job_id == Job.id)
        .join(User, Match.user_id == User.id)
        .where(Match.status == "applied")
        .order_by(Match.applied_at.desc())
        .limit(200)
    )
    rows = result.all()
    return [
        {
            "match_id": str(m.id),
            "score": m.score,
            "applied_at": m.applied_at,
            "employee": {"id": str(u.id), "name": u.name, "email": u.email},
            "job": {"title": j.title, "company": j.company, "location": j.location, "source_url": j.source_url},
        }
        for m, j, u in rows
    ]



@router.post("/fix-embeddings")
async def fix_embeddings(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """NULL out all job embeddings so the next job refresh re-embeds them cleanly."""
    from sqlalchemy import text
    result = await db.execute(text("UPDATE jobs SET embedding = NULL"))
    await db.commit()
    return {"cleared": result.rowcount, "message": "Run job refresh to re-embed all jobs"}
