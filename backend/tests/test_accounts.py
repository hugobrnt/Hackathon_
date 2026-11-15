from urllib.parse import parse_qs, urlparse

import respx
from fastapi.testclient import TestClient


def test_connect_returns_auth_url(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/instagram").respond(
        json={"authUrl": "https://zernio.com/oauth/xyz", "state": "s"}
    )
    response = client.post("/accounts/connect/instagram")
    assert response.status_code == 200
    assert response.json() == {"auth_url": "https://zernio.com/oauth/xyz"}
    params = route.calls.last.request.url.params
    assert params["profileId"] == "profile-1"
    assert params["redirect_url"].startswith(
        "http://api.test/accounts/callback?signal_state="
    )
    assert "reconnectAccountId" not in params


def test_connect_can_reconnect_account(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/instagram").respond(
        json={"authUrl": "https://zernio.com/oauth/r"}
    )
    response = client.post(
        "/accounts/connect/instagram", params={"reconnect_account_id": "acc-1"}
    )
    assert response.status_code == 200
    assert route.calls.last.request.url.params["reconnectAccountId"] == "acc-1"


def test_connect_rejects_unknown_platform(client: TestClient) -> None:
    assert client.post("/accounts/connect/myspace").status_code == 422


def test_connect_relays_zernio_error(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    zernio_mock.get("/connect/instagram").respond(
        403, json={"error": "No access", "code": "forbidden"}
    )
    response = client.post("/accounts/connect/instagram")
    assert response.status_code == 403
    assert response.json() == {"detail": "No access", "code": "forbidden"}


def test_callback_saves_account_and_redirects(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/instagram").respond(
        json={"authUrl": "https://zernio.com/oauth"}
    )
    client.post("/accounts/connect/instagram")
    state = parse_qs(
        urlparse(route.calls.last.request.url.params["redirect_url"]).query
    )["signal_state"][0]
    zernio_mock.get("/accounts").respond(
        json={
            "accounts": [
                {
                    "_id": "acc-1",
                    "platform": "instagram",
                    "profileId": "profile-1",
                    "username": "karim",
                }
            ]
        }
    )
    response = client.get(
        "/accounts/callback",
        params={
            "signal_state": state,
            "connected": "instagram",
            "accountId": "acc-1",
            "profileId": "profile-1",
            "username": "karim",
        },
    )
    assert response.status_code == 307
    location = urlparse(response.headers["location"])
    assert location.netloc == "front.test"
    assert parse_qs(location.query) == {
        "connected": ["instagram"],
        "account_id": ["acc-1"],
    }

    accounts = client.get("/accounts", params={"sync": False}).json()
    assert [(a["id"], a["username"], a["is_demo"]) for a in accounts] == [
        ("acc-1", "karim", False)
    ]


def test_callback_error_redirects_with_error(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/instagram").respond(
        json={"authUrl": "https://zernio.com/oauth"}
    )
    client.post("/accounts/connect/instagram")
    state = parse_qs(
        urlparse(route.calls.last.request.url.params["redirect_url"]).query
    )["signal_state"][0]
    response = client.get(
        "/accounts/callback",
        params={
            "signal_state": state,
            "error": "access_denied",
            "platform": "instagram",
        },
    )
    assert response.status_code == 307
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["error"] == ["access_denied"]
    assert client.get("/accounts", params={"sync": False}).json() == []


def test_sync_accounts(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/accounts").respond(
        json={
            "accounts": [
                {"_id": "acc-2", "platform": "instagram", "displayName": "Léa", "profileId":"profile-1"}
            ]
        }
    )
    response = client.post("/accounts/sync")
    assert response.status_code == 200
    assert response.json()[0]["id"] == "acc-2"
    assert response.json()[0]["username"] == "Léa"


def test_get_accounts_syncs_dashboard_accounts(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    zernio_mock.get("/accounts").respond(
        json={
            "accounts": [{"_id": "acc-3", "platform": "instagram", "username": "hugo"}]
        }
    )
    assert [a["id"] for a in client.get("/accounts").json()] == ["acc-3"]


def test_get_accounts_falls_back_to_local_on_zernio_error(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    zernio_mock.get("/accounts").respond(503, json={"error": "down"})
    assert client.get("/accounts").status_code == 200


def test_callback_rejects_replay_and_foreign_profile(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/youtube").respond(
        json={"authUrl": "https://zernio.com/oauth"}
    )
    assert client.post("/accounts/connect/youtube").status_code == 200
    state = parse_qs(
        urlparse(route.calls.last.request.url.params["redirect_url"]).query
    )["signal_state"][0]
    zernio_mock.get("/accounts").respond(
        json={
            "accounts": [
                {
                    "_id": "foreign",
                    "platform": "youtube",
                    "profileId": "another-profile",
                }
            ]
        }
    )
    query = {"connected": "youtube", "accountId": "foreign", "signal_state": state}
    response = client.get("/accounts/callback", params=query)
    assert "error=" in response.headers["location"]
    assert client.get("/accounts?sync=false").json() == []
    assert (
        "expired_connection"
        in client.get("/accounts/callback", params=query).headers["location"]
    )


def test_instagram_facebook_fallback(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    route = zernio_mock.get("/connect/instagram").respond(json={"authUrl":"https://zernio.com/connect/welcome"})
    response = client.post("/accounts/connect/instagram?login_method=facebook_login")
    assert response.status_code == 200
    assert route.calls.last.request.url.params["loginMethod"] == "facebook_login"
    assert route.calls.last.request.url.params["welcome"] == "true"
    assert client.post("/accounts/connect/youtube?login_method=facebook_login").status_code == 400


def test_recovery_only_returns_current_profile_accounts(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/accounts").respond(json={"accounts":[
        {"_id":"mine","platform":"instagram","profileId":"profile-1"},
        {"_id":"other","platform":"instagram","profileId":"another-profile"},
    ]})
    result=client.post("/accounts/sync")
    assert result.status_code == 200
    assert [a["id"] for a in result.json()] == ["mine"]


def test_callback_preserves_provider_failure_reference(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/instagram").respond(
        json={"authUrl": "https://zernio.com/oauth"}
    )
    client.post("/accounts/connect/instagram")
    state = parse_qs(
        urlparse(route.calls.last.request.url.params["redirect_url"]).query
    )["signal_state"][0]
    response = client.get("/accounts/callback", params={
        "signal_state": state,
        "error": "oauth_denied",
        "error_message": "Permission declined",
        "platform": "instagram",
        "request_id": "request-42",
        "stage": "authorize",
    })
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["error_message"] == ["Permission declined"]
    assert query["request_id"] == ["request-42"]
    assert query["stage"] == ["authorize"]
    assert client.get("/accounts", params={"sync": False}).json() == []


def test_sync_retains_invalid_authorization_until_provider_confirms_reconnection(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    remote = {"_id": "acc-1", "platform": "instagram", "profileId": "profile-1", "username": "hugo", "isActive": False, "needsReconnection": True}
    route = zernio_mock.get("/accounts").respond(json={"accounts": [remote]})
    result = client.post("/accounts/sync").json()[0]
    assert result["is_active"] is False
    assert result["needs_reconnection"] is True
    assert client.get("/accounts?sync=false").json()[0]["needs_reconnection"] is True
    route.respond(json={"accounts": [{**remote, "isActive": True, "needsReconnection": False}]})
    result = client.post("/accounts/sync").json()[0]
    assert result["id"] == "acc-1"
    assert result["is_active"] is True
    assert result["needs_reconnection"] is False


def test_callback_does_not_claim_success_for_inactive_authorization(
    client: TestClient, zernio_mock: respx.MockRouter
) -> None:
    route = zernio_mock.get("/connect/instagram").respond(json={"authUrl": "https://zernio.com/oauth"})
    client.post("/accounts/connect/instagram?reconnect_account_id=acc-1")
    state = parse_qs(urlparse(route.calls.last.request.url.params["redirect_url"]).query)["signal_state"][0]
    zernio_mock.get("/accounts").respond(json={"accounts": [{"_id": "acc-1", "profileId": "profile-1", "platform": "instagram", "isActive": False, "needsReconnection": True}]})
    response = client.get("/accounts/callback", params={"signal_state": state, "connected": "instagram", "accountId": "acc-1"})
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["error"] == ["reconnect_required"]
    assert "connected" not in query
