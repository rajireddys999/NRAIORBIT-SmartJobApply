from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Text, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    company: Mapped[str] = mapped_column(String(512), nullable=False)
    location: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(String(1024), unique=True, nullable=False)
    source: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # stored as JSON; cast to list at runtime
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
