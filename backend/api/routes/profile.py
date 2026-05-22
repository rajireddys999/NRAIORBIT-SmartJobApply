import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.database import get_db
from backend.models.user import User
from backend.models.profile import CandidateProfile
from backend.api.deps import get_current_user

router = APIRouter()


class ProfileIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = "United States"
    work_authorization: Optional[str] = None
    requires_sponsorship: bool = False
    years_experience: Optional[int] = None
    summary: Optional[str] = None


def _serialize(p: CandidateProfile, email: str) -> dict:
    return {
        "id": str(p.id),
        "email": email,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "phone": p.phone,
        "linkedin_url": p.linkedin_url,
        "github_url": p.github_url,
        "portfolio_url": p.portfolio_url,
        "city": p.city,
        "state": p.state,
        "country": p.country,
        "work_authorization": p.work_authorization,
        "requires_sponsorship": p.requires_sponsorship,
        "years_experience": p.years_experience,
        "summary": p.summary,
        "updated_at": p.updated_at,
    }


@router.get("/")
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        return None
    return _serialize(profile, current_user.email)


@router.put("/")
async def upsert_profile(
    body: ProfileIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = CandidateProfile(user_id=current_user.id)
        db.add(profile)

    for field, val in body.model_dump().items():
        setattr(profile, field, val)

    await db.commit()
    await db.refresh(profile)
    return _serialize(profile, current_user.email)
