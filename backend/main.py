from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from backend.api.routes import auth, resumes, jobs, matches, applications, admin
from backend.models.database import init_db
from backend.config import settings

logger = logging.getLogger(__name__)


async def _init_db_with_retry(attempts: int = 5, delay: float = 3.0):
    for i in range(attempts):
        try:
            await init_db()
            logger.info("Database tables verified.")
            return
        except Exception as exc:
            if i == attempts - 1:
                logger.error("DB init failed after %d attempts: %s", attempts, exc)
            else:
                logger.warning("DB init attempt %d/%d failed, retrying in %.0fs: %s", i + 1, attempts, delay, exc)
                await asyncio.sleep(delay)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_init_db_with_retry())
    yield


app = FastAPI(
    title="SmartJobApply API",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow localhost dev + Netlify production + any *.netlify.app previews
allowed_origins = [
    "http://localhost:3000",
    settings.frontend_url,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(resumes.router, prefix="/api/resumes", tags=["resumes"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])
app.include_router(applications.router, prefix="/api/applications", tags=["applications"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/detail")
async def health_detail():
    """Diagnostic endpoint — checks DB, Redis, and job count."""
    import redis as redis_lib
    from backend.models.database import AsyncSessionLocal
    from sqlalchemy import text

    result: dict = {"db": "error", "redis": "error", "jobs": 0, "status": "degraded"}

    # DB check
    try:
        async with AsyncSessionLocal() as session:
            row = await session.execute(text("SELECT COUNT(*) FROM jobs"))
            result["jobs"] = row.scalar_one()
            result["db"] = "ok"
    except Exception as e:
        result["db_error"] = str(e)

    # Redis / Celery check
    try:
        r = redis_lib.from_url(settings.redis_url, socket_connect_timeout=3)
        r.ping()
        result["redis"] = "ok"
    except Exception as e:
        result["redis_error"] = str(e)

    if result["db"] == "ok" and result["redis"] == "ok":
        result["status"] = "ok"
    return result
