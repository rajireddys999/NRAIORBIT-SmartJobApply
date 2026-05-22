from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from backend.models.database import get_db
from backend.models.user import User, ADMIN_EMAIL
from backend.services.auth import hash_password, verify_password, create_access_token

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str


class RegisterResponse(BaseModel):
    status: str          # "active" (admin) or "pending" (employee)
    role: str
    access_token: str | None = None
    token_type: str = "bearer"
    message: str = ""


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    is_admin = body.email.lower() == ADMIN_EMAIL.lower()
    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role="admin" if is_admin else "employee",
        status="active" if is_admin else "pending",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    if is_admin:
        return RegisterResponse(
            status="active",
            role="admin",
            access_token=create_access_token(str(user.id)),
        )
    return RegisterResponse(
        status="pending",
        role="employee",
        message="Your account request has been submitted. You can log in once an admin approves your access.",
    )


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending admin approval. You'll receive access shortly.",
        )
    if user.status == "revoked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account access has been revoked. Contact the admin.",
        )
    return TokenResponse(access_token=create_access_token(str(user.id)), role=user.role)


@router.get("/me")
async def me(db: AsyncSession = Depends(get_db)):
    from backend.api.deps import get_current_user
    return {"detail": "use /api/auth/me with Authorization header"}
