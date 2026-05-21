import pytest
import uuid
from backend.models.job import Job


@pytest.mark.asyncio
async def test_list_jobs_requires_auth(client):
    res = await client.get("/api/jobs/")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_list_jobs_empty(client, db_session):
    reg = await client.post("/api/auth/register", json={
        "email": f"jobtest_{uuid.uuid4().hex[:6]}@example.com",
        "name": "Job Tester",
        "password": "pass1234",
    })
    token = reg.json()["access_token"]
    res = await client.get("/api/jobs/", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_list_jobs_with_data(client, db_session):
    job = Job(
        title="Software Engineer",
        company="Acme Corp",
        location="Remote, US",
        description="Python backend role",
        source_url=f"https://indeed.com/job/{uuid.uuid4().hex}",
        source="indeed",
    )
    db_session.add(job)
    await db_session.commit()

    reg = await client.post("/api/auth/register", json={
        "email": f"jobtest2_{uuid.uuid4().hex[:6]}@example.com",
        "name": "Job Tester 2",
        "password": "pass1234",
    })
    token = reg.json()["access_token"]
    res = await client.get("/api/jobs/", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()) >= 1
