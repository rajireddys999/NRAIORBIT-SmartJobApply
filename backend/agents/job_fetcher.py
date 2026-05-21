"""
Job Fetcher Agent — runs every 30 min via Celery Beat.
Scrapes Indeed, LinkedIn (via Apify), deduplicates, stores jobs + embeddings.
"""
import asyncio
import httpx
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.celery_app import celery_app
from backend.config import settings
from backend.models.job import Job


INDEED_SEARCH_KEYWORDS = [
    "software engineer",
    "backend engineer",
    "python developer",
    "data scientist",
    "machine learning engineer",
]
US_LOCATION = "United States"


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


async def _scrape_indeed(keyword: str) -> list[dict]:
    """Scrapes Indeed via their unofficial JSON search endpoint."""
    jobs = []
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(
                "https://www.indeed.com/jobs",
                params={"q": keyword, "l": US_LOCATION, "format": "json"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            # Indeed returns HTML — real implementation uses Apify actor
            # For now, return empty and rely on Apify integration
        except Exception:
            pass
    return jobs


async def _scrape_via_apify(keyword: str) -> list[dict]:
    """
    Uses Apify's Indeed scraper actor.
    Set APIFY_API_TOKEN in env and actor ID for production.
    Returns list of {title, company, location, description, url} dicts.
    """
    import os
    token = os.getenv("APIFY_API_TOKEN", "")
    if not token:
        return []

    actor_id = "hMvNSpz3JnHgl5jkh"  # Apify Indeed Scraper
    async with httpx.AsyncClient(timeout=120) as client:
        # Start run
        run_resp = await client.post(
            f"https://api.apify.com/v2/acts/{actor_id}/runs",
            params={"token": token},
            json={
                "position": keyword,
                "location": US_LOCATION,
                "maxItems": 50,
                "country": "US",
            },
        )
        run = run_resp.json()
        run_id = run.get("data", {}).get("id")
        if not run_id:
            return []

        # Poll until finished
        for _ in range(30):
            await asyncio.sleep(10)
            status_resp = await client.get(
                f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}",
                params={"token": token},
            )
            if status_resp.json().get("data", {}).get("status") == "SUCCEEDED":
                break

        # Fetch dataset
        ds_resp = await client.get(
            f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}/dataset/items",
            params={"token": token},
        )
        items = ds_resp.json()
        return [
            {
                "title": i.get("positionName", ""),
                "company": i.get("company", ""),
                "location": i.get("location", ""),
                "description": i.get("description", ""),
                "url": i.get("url", ""),
                "source": "indeed",
            }
            for i in items
            if i.get("url")
        ]


async def _embed_and_store(jobs_data: list[dict], db: Session):
    from backend.services.embeddings import embed_batch

    # Deduplicate against existing URLs
    urls = [j["url"] for j in jobs_data]
    existing = {row[0] for row in db.execute(select(Job.source_url).where(Job.source_url.in_(urls)))}
    new_jobs = [j for j in jobs_data if j["url"] not in existing]

    if not new_jobs:
        return 0

    texts = [f"{j['title']} at {j['company']}\n{j['description']}" for j in new_jobs]
    embeddings = await embed_batch(texts)

    for job_data, emb in zip(new_jobs, embeddings):
        job = Job(
            title=job_data["title"],
            company=job_data["company"],
            location=job_data["location"],
            description=job_data["description"],
            source_url=job_data["url"],
            source=job_data.get("source", "indeed"),
            embedding=emb,
        )
        db.add(job)

    db.commit()
    return len(new_jobs)


@celery_app.task(name="backend.agents.job_fetcher.fetch_all_jobs", bind=True, max_retries=3)
def fetch_all_jobs(self):
    db = _get_sync_session()
    try:
        total = 0
        for keyword in INDEED_SEARCH_KEYWORDS:
            jobs_data = asyncio.run(_scrape_via_apify(keyword))
            if jobs_data:
                saved = asyncio.run(_embed_and_store(jobs_data, db))
                total += saved
        return {"fetched": total}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
