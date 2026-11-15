from datetime import timedelta
from typing import cast
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.domains.auth.router import require_session
from app.domains.auth.models import WorkspaceOwner, LoginSession
from app.domains.accounts.models import utc_now

PAYLOAD = {
    "name": "Test owner",
    "email": "owner@example.com",
    "password": "test-password-only-123",
}


def test_registration_login_logout_and_private_api(
    client: TestClient, session: Session
) -> None:
    cast(FastAPI, client.app).dependency_overrides.pop(require_session)
    for path in [
        "/accounts?sync=false",
        "/analytics/posts",
        "/tracking/stats",
        "/auto-dm/attempts",
    ]:
        assert client.get(path).status_code == 401
    assert client.get("/auth/status").json() == {"registration_open": True}
    r = client.post("/auth/register", json=PAYLOAD)
    assert r.status_code == 201 and "password" not in r.text
    assert (
        "HttpOnly" in r.headers["set-cookie"]
        and "SameSite=lax" in r.headers["set-cookie"]
    )
    row = session.get(WorkspaceOwner, 1)
    assert (
        row
        and row.password_hash != PAYLOAD["password"]
        and PAYLOAD["password"] not in row.password_hash
    )
    token = client.cookies.get("signal_session")
    stored = session.exec(select(LoginSession)).one()
    assert token and token != stored.token_hash
    assert client.get("/auth/me").json()["email"] == PAYLOAD["email"]
    assert client.get("/accounts?sync=false").status_code == 200
    assert (
        client.post(
            "/auth/register", json={**PAYLOAD, "email": "other@example.com"}
        ).status_code
        == 409
    )
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401
    assert (
        client.get(
            "/auth/me", headers={"cookie": "signal_session=" + token}
        ).status_code
        == 401
    )
    assert client.post("/auth/login", json=PAYLOAD).status_code == 200
    assert client.get("/auth/me").status_code == 200


def test_origin_credentials_expiry_and_public_routes(
    client: TestClient, session: Session
) -> None:
    cast(FastAPI, client.app).dependency_overrides.pop(require_session)
    assert (
        client.post(
            "/auth/register", json=PAYLOAD, headers={"origin": "https://evil.test"}
        ).status_code
        == 403
    )
    assert (
        client.post("/auth/register", json={**PAYLOAD, "password": "short"}).status_code
        == 422
    )
    assert client.post("/auth/register", json=PAYLOAD).status_code == 201
    assert (
        client.post(
            "/accounts/sync", headers={"origin": "https://evil.test"}
        ).status_code
        == 403
    )
    row = session.exec(select(LoginSession)).one()
    row.expires_at = utc_now() - timedelta(seconds=1)
    session.add(row)
    session.commit()
    assert client.get("/auth/me").status_code == 401
    assert client.get("/health").status_code == 200
    assert client.get("/r/missing").status_code == 404
    assert client.post("/webhooks/zernio", json={}).status_code == 401
    assert (
        "expired_connection"
        in client.get(
            "/accounts/callback?connected=instagram&accountId=forged"
        ).headers["location"]
    )


def test_login_throttle(client: TestClient) -> None:
    client.post("/auth/register", json=PAYLOAD)
    client.post("/auth/logout")
    for _ in range(10):
        assert (
            client.post(
                "/auth/login", json={**PAYLOAD, "password": "wrong-password-123"}
            ).status_code
            == 401
        )
    assert client.post("/auth/login", json=PAYLOAD).status_code == 429
