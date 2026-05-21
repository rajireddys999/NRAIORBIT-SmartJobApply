from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, Text, ForeignKey, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base


def _vector_col(dims: int):
    """Returns a Vector column if pgvector is available, else Text (for SQLite tests)."""
    try:
        from pgvector.sqlalchemy import Vector
        return mapped_column(Vector(dims), nullable=True)
    except Exception:
        return mapped_column(Text, nullable=True)


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    s3_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    parsed_text: Mapped[Optional[str]] = mapped_column(Text)
    embedding: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # stored as JSON text; cast to list at runtime
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
