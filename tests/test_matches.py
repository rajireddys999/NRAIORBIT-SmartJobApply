import pytest
import uuid
from backend.models.job import Job
from backend.models.resume import Resume
from backend.models.match import Match, MatchStatus
from backend.models.user import User
from backend.services.auth import hash_password


@pytest.mark.asyncio
async def test_matches_endpoint(client, db_session):
    email = f"match_{uuid.uuid4().hex[:6]}@example.com"
    reg = await client.post("/api/auth/register", json={
        "email": email, "name": "Match Tester", "password": "pass1234",
    })
    token = reg.json()["access_token"]

    res = await client.get("/api/matches/", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_cosine_similarity():
    from backend.agents.resume_matcher import _cosine_similarity, _score_to_percent
    import numpy as np
    a = [1.0, 0.0, 0.0]
    b = [1.0, 0.0, 0.0]
    assert _cosine_similarity(a, b) == pytest.approx(1.0)
    assert _score_to_percent(1.0) == pytest.approx(100.0)
    assert _score_to_percent(-1.0) == pytest.approx(0.0)
    assert _score_to_percent(0.0) == pytest.approx(50.0)
