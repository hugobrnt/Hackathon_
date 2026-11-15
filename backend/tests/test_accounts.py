from urllib.parse import parse_qs, urlparse

import respx
from fastapi.testclient import TestClient


def test_connect_returns_auth_url(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    route = zernio_mock.get("/connect/instagram").respond(
        json={"authUrl": "https://zernio.com/oauth/xyz", "state": "s"}
    )
    response = client.post("/accounts/connect/instagram")
    assert response.status_code == 200
    assert response.json() == {"auth_url": "https://zernio.com/oauth/xyz"}
    params = route.calls.last.request.url.params
    assert params["profileId"] == "profile-1"
    assert params["redirect_url"] == "http://api.test/accounts/callback"
    assert "reconnectAccountId" not in params


def test_connect_can_reconnect_account(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    route = zernio_mock.get("/connect/instagram").respond(json={"authUrl": "https://zernio.com/oauth/r"})
    response = client.post("/accounts/connect/instagram", params={"reconnect_account_id": "acc-1"})
    assert response.status_code == 200
    assert route.calls.last.request.url.params["reconnectAccountId"] == "acc-1"


def test_connect_rejects_unknown_platform(client: TestClient) -> None:
    assert client.post("/accounts/connect/myspace").status_code == 422


def test_connect_relays_zernio_error(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/connect/instagram").respond(403, json={"error": "No access", "code": "forbidden"})
    response = client.post("/accounts/connect/instagram")
    assert response.status_code == 403
    assert response.json() == {"detail": "No access", "code": "forbidden"}


def test_callback_saves_account_and_redirects(client: TestClient) -> None:
    response = client.get(
        "/accounts/callback",
        params={"connected": "instagram", "accountId": "acc-1", "profileId": "profile-1", "username": "karim"},
    )
    assert response.status_code == 307
    location = urlparse(response.headers["location"])
    assert location.netloc == "front.test"
    assert parse_qs(location.query) == {"connected": ["instagram"], "account_id": ["acc-1"]}

    accounts = client.get("/accounts", params={"sync": False}).json()
    assert [(a["id"], a["username"], a["is_demo"]) for a in accounts] == [("acc-1", "karim", False)]


def test_callback_error_redirects_with_error(client: TestClient) -> None:
    response = client.get("/accounts/callback", params={"error": "access_denied", "platform": "instagram"})
    assert response.status_code == 307
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["error"] == ["access_denied"]
    assert client.get("/accounts", params={"sync": False}).json() == []


def test_sync_accounts(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/accounts").respond(
        json={"accounts": [{"_id": "acc-2", "platform": "instagram", "displayName": "Léa"}]}
    )
    response = client.post("/accounts/sync")
    assert response.status_code == 200
    assert response.json()[0]["id"] == "acc-2"
    assert response.json()[0]["username"] == "Léa"


def test_get_accounts_syncs_dashboard_accounts(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/accounts").respond(
        json={"accounts": [{"_id": "acc-3", "platform": "instagram", "username": "hugo"}]}
    )
    assert [a["id"] for a in client.get("/accounts").json()] == ["acc-3"]


def test_get_accounts_falls_back_to_local_on_zernio_error(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/accounts").respond(503, json={"error": "down"})
    assert client.get("/accounts").status_code == 200
