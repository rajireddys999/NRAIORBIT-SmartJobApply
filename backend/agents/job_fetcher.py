"""
Job Fetcher Agent — runs every 30 min via Celery Beat.
Uses three free public job APIs (no keys required):
  - The Muse (themuse.com/api) — 1000 calls/day, US tech jobs
  - Arbeitnow (arbeitnow.com/api) — unlimited, remote/EU jobs
  - RemoteOK (remoteok.com/api)  — unlimited, remote tech jobs
"""
import asyncio
import httpx
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.celery_app import celery_app
from backend.models.job import Job


TECH_TAGS = ["python", "backend", "software-engineer", "data-science", "machine-learning"]


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from backend.config import settings
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


async def _fetch_themuse(client: httpx.AsyncClient) -> list[dict]:
    """The Muse public API — no key required, 1000 calls/day."""
    results = []
    categories = ["Software Engineer", "Data Science", "Machine Learning", "Engineering"]
    for cat in categories:
        try:
            resp = await client.get(
                "https://www.themuse.com/api/public/jobs",
                params={"category": cat, "level": "Mid Level", "page": 0, "per_page": 20},
                timeout=15,
            )
            resp.raise_for_status()
            for item in resp.json().get("results", []):
                refs = item.get("refs", {})
                url = refs.get("landing_page", "")
                if not url:
                    continue
                company = item.get("company", {}).get("name", "")
                locations = item.get("locations", [{}])
                location = locations[0].get("name", "Remote") if locations else "Remote"
                results.append({
                    "title": item.get("name", ""),
                    "company": company,
                    "location": location,
                    "description": item.get("contents", "")[:3000],
                    "url": url,
                    "source": "themuse",
                })
        except Exception:
            continue
    return results


async def _fetch_arbeitnow(client: httpx.AsyncClient) -> list[dict]:
    """Arbeitnow free API — no key, remote + European tech jobs."""
    results = []
    try:
        resp = await client.get(
            "https://www.arbeitnow.com/api/job-board-api",
            params={"page": 1},
            timeout=15,
        )
        resp.raise_for_status()
        for item in resp.json().get("data", []):
            tags = [t.lower() for t in item.get("tags", [])]
            if not any(t in tags for t in ["python", "backend", "engineer", "data", "ml", "software"]):
                continue
            results.append({
                "title": item.get("title", ""),
                "company": item.get("company_name", ""),
                "location": item.get("location", "Remote"),
                "description": item.get("description", "")[:3000],
                "url": item.get("url", ""),
                "source": "arbeitnow",
            })
    except Exception:
        pass
    return results


async def _fetch_remoteok(client: httpx.AsyncClient) -> list[dict]:
    """RemoteOK public API — completely free, remote tech jobs."""
    results = []
    for tag in TECH_TAGS:
        try:
            resp = await client.get(
                f"https://remoteok.com/api?tag={tag}",
                headers={"User-Agent": "SmartJobApply/1.0"},
                timeout=15,
            )
            resp.raise_for_status()
            items = resp.json()
            if isinstance(items, list) and items and "legal" in items[0]:
                items = items[1:]  # first item is a legal notice
            for item in items[:30]:
                url = item.get("url", "")
                if not url or not url.startswith("http"):
                    continue
                results.append({
                    "title": item.get("position", ""),
                    "company": item.get("company", ""),
                    "location": item.get("location", "Remote"),
                    "description": item.get("description", "")[:3000],
                    "url": url,
                    "source": "remoteok",
                })
        except Exception:
            continue
    return results


async def _fetch_all() -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        muse, arbeitnow, remoteok = await asyncio.gather(
            _fetch_themuse(client),
            _fetch_arbeitnow(client),
            _fetch_remoteok(client),
            return_exceptions=True,
        )
    jobs: list[dict] = []
    for result in [muse, arbeitnow, remoteok]:
        if isinstance(result, list):
            jobs.extend(result)
    return [j for j in jobs if j.get("url") and j.get("title")]


async def _embed_and_store(jobs_data: list[dict], db: Session) -> int:
    from backend.services.embeddings import embed_batch

    urls = [j["url"] for j in jobs_data]
    existing = {row[0] for row in db.execute(select(Job.source_url).where(Job.source_url.in_(urls)))}
    new_jobs = [j for j in jobs_data if j["url"] not in existing]

    if not new_jobs:
        return 0

    texts = [f"{j['title']} at {j['company']}\n{j['description']}" for j in new_jobs]
    embeddings = await embed_batch(texts)

    for job_data, emb in zip(new_jobs, embeddings):
        db.add(Job(
            title=job_data["title"],
            company=job_data["company"],
            location=job_data["location"],
            description=job_data["description"],
            source_url=job_data["url"],
            source=job_data["source"],
            embedding=emb,
        ))

    db.commit()
    return len(new_jobs)


@celery_app.task(name="backend.agents.job_fetcher.fetch_all_jobs", bind=True, max_retries=3)
def fetch_all_jobs(self):
    db = _get_sync_session()
    try:
        jobs_data = asyncio.run(_fetch_all())
        saved = asyncio.run(_embed_and_store(jobs_data, db))
        return {"fetched": len(jobs_data), "saved": saved}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
