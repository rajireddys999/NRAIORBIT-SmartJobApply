import json
from sqlalchemy import Text, text
from sqlalchemy.types import TypeDecorator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings


class JsonList(TypeDecorator):
    """Stores list[float] as a JSON string in a TEXT column."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            # Convert numpy arrays to plain Python lists before JSON serialization
            if hasattr(value, "tolist"):
                value = value.tolist()
            return json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                return None  # stale numpy-format string — treat as missing
        return value

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    # Import all models so SQLAlchemy knows their tables before create_all
    from backend.models import user, job, resume, match, notification, profile  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent migration: add role/status columns to existing users table.
        # server_default='active' so pre-existing rows are active, not pending.
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'employee'"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'"
        ))
        await conn.execute(text(
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ NULL"
        ))
        # Ensure the designated admin has admin role and is always active.
        from backend.models.user import ADMIN_EMAIL
        await conn.execute(text(
            "UPDATE users SET role = 'admin', status = 'active' WHERE email = :email"
        ), {"email": ADMIN_EMAIL})


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
