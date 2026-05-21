import pytest


@pytest.mark.asyncio
async def test_register_and_login(client):
    reg = await client.post("/api/auth/register", json={
        "email": "test@example.com",
        "name": "Test User",
        "password": "password123",
    })
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    assert token

    # duplicate registration should fail
    dup = await client.post("/api/auth/register", json={
        "email": "test@example.com",
        "name": "Test User",
        "password": "password123",
    })
    assert dup.status_code == 409

    # login
    login = await client.post("/api/auth/login", data={
        "username": "test@example.com",
        "password": "password123",
    })
    assert login.status_code == 200
    assert login.json()["access_token"]


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/api/auth/register", json={
        "email": "wrong@example.com",
        "name": "Wrong",
        "password": "correct",
    })
    res = await client.post("/api/auth/login", data={
        "username": "wrong@example.com",
        "password": "incorrect",
    })
    assert res.status_code == 401
