"""
Job Fetcher Agent — runs every 30 min via Celery Beat.

Sources (all free, no API keys required):
  - The Muse      — US tech jobs, entry + mid level, 1000 calls/day
  - Arbeitnow     — remote + EU tech jobs
  - RemoteOK      — remote tech jobs by tag
  - Greenhouse    — company career pages (Stripe, Datadog, Figma, Airbnb, etc.)
  - LinkedIn      — location-based (Charlotte, Dallas, Austin, Atlanta)
"""
import asyncio
import re
import httpx
from bs4 import BeautifulSoup
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.celery_app import celery_app
from backend.models.job import Job


TECH_TAGS = ["python", "backend", "software-engineer", "data-science", "machine-learning"]

# Companies using Greenhouse ATS — public JSON API, no auth required.
# Add/remove slugs freely; 404s are caught and skipped.
GREENHOUSE_COMPANIES = [
    "stripe", "brex", "gusto", "figma", "datadog",
    "airbnb", "lyft", "robinhood", "confluent", "zendesk",
    "intercom", "mongodb", "elastic", "okta", "cloudflare",
]

# US metros for LinkedIn location-based search + The Muse location filter
SEARCH_LOCATIONS = [
    "Charlotte, NC",
    "Dallas, TX",
    "Austin, TX",
    "Atlanta, GA",
    "Remote",
]

# LinkedIn keywords — mix of fresher and experienced queries
LINKEDIN_KEYWORDS = [
    "python developer",
    "entry level software engineer",
    "junior software engineer",
    "backend engineer",
    "data scientist",
]


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from backend.config import settings
    engine = create_engine(settings.sync_database_url)
    return sessionmaker(bind=engine)()


# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------

async def _fetch_themuse(client: httpx.AsyncClient) -> list[dict]:
    """The Muse public API — no key required, 1000 calls/day.
    Fetches both Entry Level (freshers) and Mid Level (experienced) roles.
    """
    results = []
    categories = ["Software Engineer", "Data Science", "Machine Learning", "Engineering"]
    levels = ["Entry Level", "Mid Level"]
    for cat in categories:
        for level in levels:
            try:
                resp = await client.get(
                    "https://www.themuse.com/api/public/jobs",
                    params={"category": cat, "level": level, "page": 0, "per_page": 20},
                    timeout=15,
                )
                resp.raise_for_status()
                for item in resp.json().get("results", []):
                    url = item.get("refs", {}).get("landing_page", "")
                    if not url:
                        continue
                    locations = item.get("locations", [{}])
                    location = locations[0].get("name", "Remote") if locations else "Remote"
                    results.append({
                        "title": item.get("name", ""),
                        "company": item.get("company", {}).get("name", ""),
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
                items = items[1:]
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


async def _fetch_greenhouse(client: httpx.AsyncClient) -> list[dict]:
    """Greenhouse ATS public API — company career pages, no auth needed.

    Returns full job descriptions from Stripe, Datadog, Figma, and 12 other
    companies. Cap 30 jobs per company to keep response sizes manageable.
    """
    results = []
    for company in GREENHOUSE_COMPANIES:
        try:
            resp = await client.get(
                f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs",
                params={"content": "true"},
                timeout=20,
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            display_name = data.get("name", company.capitalize())
            for job in data.get("jobs", [])[:30]:
                title = job.get("title", "").strip()
                url = job.get("absolute_url", "").strip()
                if not url or not title:
                    continue
                location_data = job.get("location", {})
                location = (
                    location_data.get("name", "Remote")
                    if isinstance(location_data, dict)
                    else "Remote"
                )
                raw_desc = job.get("content", "") or title
                if "<" in raw_desc:
                    description = BeautifulSoup(raw_desc, "html.parser").get_text(" ", strip=True)
                else:
                    description = raw_desc
                results.append({
                    "title": title,
                    "company": display_name,
                    "location": location,
                    "description": description[:3000],
                    "url": url,
                    "source": "greenhouse",
                })
        except Exception:
            continue
    return results


async def _fetch_linkedin(client: httpx.AsyncClient) -> list[dict]:
    """LinkedIn Jobs Guest API — location-based, no auth required.

    Searches US cities (Charlotte, Dallas, Austin, Atlanta) for both
    fresher and experienced roles. Rate-limited to avoid IP blocking:
    3 locations × 3 keywords = 9 requests per cycle.
    Returns title/company/location/URL only — LinkedIn hides full JDs.
    """
    results = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    us_cities = [loc for loc in SEARCH_LOCATIONS if loc != "Remote"][:3]
    keywords = LINKEDIN_KEYWORDS[:3]

    for location in us_cities:
        for keyword in keywords:
            try:
                resp = await client.get(
                    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
                    params={
                        "keywords": keyword,
                        "location": location,
                        "start": 0,
                        "f_TPR": "r604800",  # last 7 days
                    },
                    headers=headers,
                    timeout=15,
                )
                if resp.status_code != 200:
                    continue
                soup = BeautifulSoup(resp.text, "html.parser")
                for card in soup.find_all("li"):
                    title_el = card.find(class_=re.compile(r"base-search-card__title"))
                    company_el = card.find(class_=re.compile(r"base-search-card__subtitle"))
                    location_el = card.find(class_=re.compile(r"job-search-card__location"))
                    link_el = card.find("a", href=re.compile(r"linkedin\.com/jobs/view/"))
                    if not (title_el and link_el):
                        continue
                    url = link_el.get("href", "").split("?")[0].rstrip("/")
                    if not url:
                        continue
                    title = title_el.get_text(strip=True)
                    company = company_el.get_text(strip=True) if company_el else ""
                    job_location = location_el.get_text(strip=True) if location_el else location
                    # Build a short description so the embedding captures context.
                    # Full JD requires auth; title + context is enough for matching.
                    description = (
                        f"{title} position at {company} in {job_location}. "
                        f"Search keywords: {keyword}."
                    )
                    results.append({
                        "title": title,
                        "company": company,
                        "location": job_location,
                        "description": description,
                        "url": url,
                        "source": "linkedin",
                    })
            except Exception:
                continue
    return results


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

async def _fetch_core() -> list[dict]:
    """The Muse + Arbeitnow + RemoteOK + Greenhouse — runs every 30 min."""
    async with httpx.AsyncClient(timeout=30) as client:
        gathered = await asyncio.gather(
            _fetch_themuse(client),
            _fetch_arbeitnow(client),
            _fetch_remoteok(client),
            _fetch_greenhouse(client),
            return_exceptions=True,
        )
    jobs: list[dict] = []
    for result in gathered:
        if isinstance(result, list):
            jobs.extend(result)
    return [j for j in jobs if j.get("url") and j.get("title")]


async def _fetch_all() -> list[dict]:
    """All 5 sources — used only for manual admin refresh."""
    async with httpx.AsyncClient(timeout=30) as client:
        gathered = await asyncio.gather(
            _fetch_themuse(client),
            _fetch_arbeitnow(client),
            _fetch_remoteok(client),
            _fetch_greenhouse(client),
            _fetch_linkedin(client),
            return_exceptions=True,
        )
    jobs: list[dict] = []
    for result in gathered:
        if isinstance(result, list):
            jobs.extend(result)
    return [j for j in jobs if j.get("url") and j.get("title")]


async def _embed_and_store(jobs_data: list[dict], db: Session) -> int:
    from backend.services.embeddings import embed_batch
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    # Deduplicate within the fetched batch first (RemoteOK / LinkedIn return
    # the same URL for different tag/keyword queries).
    seen: set[str] = set()
    unique_jobs = []
    for j in jobs_data:
        if j["url"] not in seen:
            seen.add(j["url"])
            unique_jobs.append(j)

    urls = [j["url"] for j in unique_jobs]
    existing = {
        row[0]
        for row in db.execute(select(Job.source_url).where(Job.source_url.in_(urls)))
    }
    new_jobs = [j for j in unique_jobs if j["url"] not in existing]

    if not new_jobs:
        return 0

    texts = [f"{j['title']} at {j['company']}\n{j['description']}" for j in new_jobs]
    embeddings = await embed_batch(texts)

    for job_data, emb in zip(new_jobs, embeddings):
        stmt = pg_insert(Job).values(
            title=job_data["title"],
            company=job_data["company"],
            location=job_data["location"],
            description=job_data["description"],
            source_url=job_data["url"],
            source=job_data["source"],
            embedding=emb,
        ).on_conflict_do_nothing(index_elements=["source_url"])
        db.execute(stmt)

    db.commit()
    return len(new_jobs)


@celery_app.task(name="backend.agents.job_fetcher.fetch_core_jobs", bind=True, max_retries=3)
def fetch_core_jobs(self):
    """Runs every 30 min — The Muse, Arbeitnow, RemoteOK, Greenhouse."""
    db = _get_sync_session()
    try:
        jobs_data = asyncio.run(_fetch_core())
        saved = asyncio.run(_embed_and_store(jobs_data, db))
        return {"fetched": len(jobs_data), "saved": saved, "source": "core"}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="backend.agents.job_fetcher.fetch_linkedin_jobs", bind=True, max_retries=2)
def fetch_linkedin_jobs(self):
    """Runs once daily at 6 AM UTC — LinkedIn guest API only."""
    db = _get_sync_session()
    try:
        async def _run():
            async with httpx.AsyncClient(timeout=30) as client:
                return await _fetch_linkedin(client)
        jobs_data = asyncio.run(_run())
        jobs_data = [j for j in jobs_data if j.get("url") and j.get("title")]
        saved = asyncio.run(_embed_and_store(jobs_data, db))
        return {"fetched": len(jobs_data), "saved": saved, "source": "linkedin"}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()


@celery_app.task(name="backend.agents.job_fetcher.fetch_all_jobs", bind=True, max_retries=3)
def fetch_all_jobs(self):
    """Manual refresh — all 5 sources including LinkedIn."""
    db = _get_sync_session()
    try:
        jobs_data = asyncio.run(_fetch_all())
        saved = asyncio.run(_embed_and_store(jobs_data, db))
        return {"fetched": len(jobs_data), "saved": saved, "source": "all"}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
