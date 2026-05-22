from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base

ADMIN_EMAIL = "rajireddys999@gmail.com"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # role: "admin" | "employee"  — employees need admin approval before accessing the app
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="employee", server_default="employee")
    # status: "pending" | "active" | "revoked"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="active")
