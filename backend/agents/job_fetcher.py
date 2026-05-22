"""
Job Fetcher Agent — runs every 30 min via Celery Beat.

Sources:
  Free public APIs (no key required):
    - The Muse      — US tech jobs, entry + mid level
    - Arbeitnow     — remote + EU tech jobs
    - RemoteOK      — remote tech jobs by tag
    - Greenhouse    — company career pages (Stripe, Datadog, Figma, Airbnb, etc.)
    - Lever ATS     — OpenAI, Coinbase, DoorDash, Scale AI, Notion, and more
    - Ashby ATS     — Vercel, Retool, Linear, Rippling, Loom, and more

  Official publisher APIs (key required, gracefully skipped if not set):
    - Indeed        — 250M+ listings; requires INDEED_PUBLISHER_ID env var

  Rate-limited (once daily):
    - LinkedIn      — location-based guest API
"""
import asyncio
import re
from datetime import datetime, timezone
import httpx
from bs4 import BeautifulSoup
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.celery_app import celery_app
from backend.models.job import Job


def _parse_date(raw) -> datetime | None:
    """Parse posting dates from various source formats into UTC datetime."""
    if raw is None:
        return None
    try:
        if isinstance(raw, (int, float)):
            ts = raw / 1000 if raw > 1e10 else raw  # ms → s if needed
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(raw, str):
            raw = raw.strip().rstrip("Z")
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d",
                "%a, %d %b %Y %H:%M:%S %Z",
                "%a, %d %b %Y %H:%M:%S GMT",
            ):
                try:
                    return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
    except Exception:
        pass
    return None


TECH_TAGS = ["python", "backend", "software-engineer", "data-science", "machine-learning"]

# Companies using Greenhouse ATS — public JSON API, no auth required.
# Add/remove slugs freely; 404s are caught and skipped.
GREENHOUSE_COMPANIES = [
    "stripe", "brex", "gusto", "figma", "datadog",
    "airbnb", "lyft", "robinhood", "confluent", "zendesk",
    "intercom", "mongodb", "elastic", "okta", "cloudflare",
]

# Companies using Lever ATS — free public JSON API, no auth required
LEVER_COMPANIES = [
    "openai", "coinbase", "doordash", "scale", "notion",
    "reddit", "carta", "benchling", "lattice", "vanta",
    "gem", "dbt-labs", "census", "prefect", "cube",
]

# Companies using Ashby ATS — free public JSON API, no auth required
ASHBY_COMPANIES = [
    "vercel", "retool", "linear", "rippling", "loom",
    "ramp", "brex", "deel", "mercury", "airplane",
    "supabase", "neon", "clerk", "resend", "trigger",
]

# Indeed search queries split by experience level
INDEED_ENTRY_QUERIES = [
    "entry level software engineer",
    "junior python developer",
    "associate software engineer",
    "new grad software engineer",
    "junior data scientist",
    "entry level backend developer",
]
INDEED_EXPERIENCED_QUERIES = [
    "senior software engineer",
    "senior python developer",
    "backend engineer",
    "data scientist",
    "machine learning engineer",
    "software engineer",
]

# Target locations — USA metros + India cities + Remote
US_LOCATIONS = [
    "Charlotte, NC",
    "Dallas, TX",
    "Austin, TX",
    "Atlanta, GA",
    "New York, NY",
    "San Francisco, CA",
]
INDIA_LOCATIONS = [
    "Bangalore, Karnataka, India",
    "Hyderabad, Telangana, India",
    "Mumbai, Maharashtra, India",
    "Chennai, Tamil Nadu, India",
    "Pune, Maharashtra, India",
]
SEARCH_LOCATIONS = US_LOCATIONS + INDIA_LOCATIONS + ["Remote"]

# LinkedIn keywords — mix of fresher and experienced queries
LINKEDIN_KEYWORDS = [
    "python developer",
    "entry level software engineer",
    "junior software engineer",
    "backend engineer",
    "data scientist",
    "data engineer",
]

# Location strings that indicate a job is NOT in USA or India (for post-fetch filtering)
_BLOCKED_COUNTRIES = {
    "uk", "united kingdom", "germany", "france", "netherlands", "canada",
    "australia", "singapore", "brazil", "mexico", "spain", "italy",
    "poland", "sweden", "norway", "denmark", "finland", "austria",
    "switzerland", "belgium", "portugal", "ukraine", "czech", "ireland",
}


def _is_usa_or_india(location: str) -> bool:
    """Return True if job is in USA, India, or Remote — filter out other countries."""
    if not location:
        return True  # no location = keep
    loc = location.lower()
    if any(w in loc for w in ("remote", "worldwide", "anywhere", "global")):
        return True
    if any(w in loc for w in ("india", ", in", "bangalore", "hyderabad", "mumbai", "chennai",
                               "pune", "delhi", "kolkata", "noida", "gurugram", "gurgaon")):
        return True
    if any(w in loc for w in (", us", "usa", "united states", ", ny", ", ca", ", tx",
                               ", nc", ", ga", ", wa", ", il", ", fl", ", ma", ", va")):
        return True
    # If the location explicitly names a blocked country, exclude
    if any(w in loc for w in _BLOCKED_COUNTRIES):
        return False
    return True  # unknown location — keep


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
                "posted_at": _parse_date(item.get("created_at")),
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
                    "posted_at": _parse_date(item.get("date")),
                })
        except Exception:
            continue
    return results


async def _fetch_lever(client: httpx.AsyncClient) -> list[dict]:
    """Lever ATS public API — company career pages, no auth required.

    Used by OpenAI, Coinbase, DoorDash, Scale AI, Notion, Reddit, and more.
    Endpoint returns all open roles as JSON; filters for tech roles by title.
    """
    TECH_KEYWORDS = {
        "engineer", "developer", "data", "machine learning", "ml", "ai",
        "backend", "frontend", "fullstack", "devops", "platform", "software",
        "analyst", "scientist", "research",
    }
    results = []
    for company in LEVER_COMPANIES:
        try:
            resp = await client.get(
                f"https://api.lever.co/v0/postings/{company}",
                params={"mode": "json"},
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            for job in resp.json()[:50]:
                title = job.get("text", "").strip()
                url = job.get("hostedUrl", "").strip()
                if not title or not url:
                    continue
                if not any(kw in title.lower() for kw in TECH_KEYWORDS):
                    continue
                categories = job.get("categories", {})
                location = categories.get("location", "Remote") or "Remote"
                team = categories.get("team", "")
                commitment = categories.get("commitment", "")
                description_plain = job.get("descriptionPlain", "") or job.get("description", "") or title
                results.append({
                    "title": title,
                    "company": company.replace("-", " ").title(),
                    "location": location,
                    "description": f"{description_plain[:2000]}\nTeam: {team}. Type: {commitment}.",
                    "url": url,
                    "source": "lever",
                    "posted_at": _parse_date(job.get("createdAt")),
                })
        except Exception:
            continue
    return results


async def _fetch_ashby(client: httpx.AsyncClient) -> list[dict]:
    """Ashby ATS public API — company career pages, no auth required.

    Used by Vercel, Retool, Linear, Rippling, Loom, Ramp, Mercury, and more.
    """
    results = []
    for company in ASHBY_COMPANIES:
        try:
            resp = await client.post(
                f"https://api.ashbyhq.com/posting-api/job-board/{company}",
                json={"limit": 50},
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            jobs = data.get("jobs", [])
            company_name = data.get("organization", {}).get("name", company.title())
            for job in jobs:
                title = job.get("title", "").strip()
                url = job.get("jobUrl", "").strip()
                if not title or not url:
                    continue
                location = job.get("location", "Remote") or "Remote"
                dept = job.get("department", "")
                description = job.get("descriptionHtml", "") or job.get("description", "") or title
                if "<" in description:
                    description = BeautifulSoup(description, "html.parser").get_text(" ", strip=True)
                results.append({
                    "title": title,
                    "company": company_name,
                    "location": location,
                    "description": f"{description[:2000]}\nDepartment: {dept}.",
                    "url": url,
                    "source": "ashby",
                    "posted_at": _parse_date(job.get("publishedDate") or job.get("updatedAt")),
                })
        except Exception:
            continue
    return results


async def _fetch_indeed(client: httpx.AsyncClient) -> list[dict]:
    """Indeed Publisher API — official subscription, 250M+ listings.

    Requires INDEED_PUBLISHER_ID env var. Searches both entry-level and
    experienced queries across configured US locations. Skipped silently
    if publisher ID is not set.
    """
    from backend.config import settings
    if not settings.indeed_publisher_id:
        return []

    results = []
    all_queries = [
        *[(q, "entry") for q in INDEED_ENTRY_QUERIES],
        *[(q, "experienced") for q in INDEED_EXPERIENCED_QUERIES],
    ]
    locations = [loc for loc in SEARCH_LOCATIONS if loc != "Remote"]

    for location in locations:
        for query, _ in all_queries[:4]:  # cap: 4 queries × 4 locations = 16 requests
            try:
                resp = await client.get(
                    "https://api.indeed.com/ads/apisearch",
                    params={
                        "publisher": settings.indeed_publisher_id,
                        "q": query,
                        "l": location,
                        "sort": "date",
                        "radius": 25,
                        "limit": 25,
                        "format": "json",
                        "v": "2",
                        "co": "us",
                        "fromage": 7,  # last 7 days
                        "latlong": 1,
                    },
                    timeout=15,
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                for job in data.get("results", []):
                    url = job.get("url", "").strip()
                    title = job.get("jobtitle", "").strip()
                    if not url or not title:
                        continue
                    job_location = job.get("formattedLocationFull", "") or job.get("formattedLocation", location)
                    results.append({
                        "title": title,
                        "company": job.get("company", "").strip(),
                        "location": job_location,
                        "description": job.get("snippet", "")[:3000],
                        "url": url,
                        "source": "indeed",
                        "posted_at": _parse_date(job.get("date")),
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
                    "posted_at": _parse_date(job.get("updated_at")),
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
    # Search top 3 US cities + top 2 India cities
    us_cities = US_LOCATIONS[:3]
    india_cities = INDIA_LOCATIONS[:2]
    search_cities = us_cities + india_cities
    keywords = LINKEDIN_KEYWORDS[:3]

    for location in search_cities:
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

def _filter_locations(jobs: list[dict]) -> list[dict]:
    return [j for j in jobs if j.get("url") and j.get("title") and _is_usa_or_india(j.get("location", ""))]


async def _fetch_core() -> list[dict]:
    """Core sources — runs every 30 min. USA + India locations only."""
    async with httpx.AsyncClient(timeout=30) as client:
        gathered = await asyncio.gather(
            _fetch_themuse(client),
            _fetch_arbeitnow(client),
            _fetch_remoteok(client),
            _fetch_greenhouse(client),
            _fetch_lever(client),
            _fetch_ashby(client),
            _fetch_indeed(client),
            return_exceptions=True,
        )
    jobs: list[dict] = []
    for result in gathered:
        if isinstance(result, list):
            jobs.extend(result)
    return _filter_locations(jobs)


async def _fetch_all() -> list[dict]:
    """All sources including LinkedIn — used for manual admin refresh. USA + India only."""
    async with httpx.AsyncClient(timeout=30) as client:
        gathered = await asyncio.gather(
            _fetch_themuse(client),
            _fetch_arbeitnow(client),
            _fetch_remoteok(client),
            _fetch_greenhouse(client),
            _fetch_lever(client),
            _fetch_ashby(client),
            _fetch_indeed(client),
            _fetch_linkedin(client),
            return_exceptions=True,
        )
    jobs: list[dict] = []
    for result in gathered:
        if isinstance(result, list):
            jobs.extend(result)
    return _filter_locations(jobs)


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
            posted_at=job_data.get("posted_at"),
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
