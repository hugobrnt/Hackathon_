import json
from typing import Any

import respx
from fastapi.testclient import TestClient
from sqlmodel import Session

from tests.test_outreach import setup_post

BOOST = {"ad_account_id": "act_1", "budget_amount": 5, "budget_type": "daily", "duration_days": 3, "confirm": True}


def ad_response(**ad: Any) -> dict[str, Any]:
    return {"ad": {"_id": "ad-1", "campaignId": "cmp-1", "status": "PAUSED", "reviewStatus": "pending_review", **ad},
            "message": "Boost created", "warnings": []}


def test_list_ad_accounts(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/ads/accounts").respond(
        json={"accounts": [{"id": "act_1", "name": "Shop", "currency": "EUR", "accountStatus": 1, "selected": True}]}
    )
    body = client.get("/ads/accounts", params={"account_id": "acc-1"}).json()
    assert body == [{"id": "act_1", "name": "Shop", "currency": "EUR", "account_status": 1}]


def test_list_ad_accounts_explains_missing_facebook(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/ads/accounts").respond(
        422, json={"error": "A connected Facebook account is required.", "code": "linked_account_required"}
    )
    response = client.get("/ads/accounts", params={"account_id": "acc-1"})
    assert response.status_code == 422 and "Facebook Page" in response.json()["detail"]


def test_boost_creates_paused_campaign(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    route = zernio_mock.post("/ads/boost").respond(201, json=ad_response())
    response = client.post(f"/posts/{post_id}/boost", json=BOOST)
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["status"], body["is_success"], body["review_status"]) == ("created", True, "pending_review")
    assert (body["zernio_ad_id"], body["campaign_id"], body["total_budget"]) == ("ad-1", "cmp-1", 15)

    request = route.calls.last.request
    sent = json.loads(request.content)
    assert sent["platformPostId"] == "p1" and sent["accountId"] == "acc-1" and sent["adAccountId"] == "act_1"
    assert (sent["status"], sent["budgetAmount"], sent["budgetType"], sent["goal"]) == ("PAUSED", 5, "daily", "engagement")
    assert sent["startDate"] < sent["endDate"]
    assert request.headers["Idempotency-Key"]

    assert len(client.get(f"/posts/{post_id}/boosts").json()) == 1

    zernio_mock.get("/ads/ad-1").respond(json={"_id": "ad-1", "status": "ACTIVE", "reviewStatus": "approved"})
    refreshed = client.post(f"/ads/boosts/{body['id']}/refresh").json()
    assert (refreshed["ad_status"], refreshed["review_status"]) == ("ACTIVE", "approved")


def test_boost_guardrails(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    route = zernio_mock.post("/ads/boost").respond(201, json=ad_response())
    assert client.post(f"/posts/{post_id}/boost", json={**BOOST, "confirm": False}).status_code == 400
    over = client.post(f"/posts/{post_id}/boost", json={**BOOST, "budget_amount": 20, "duration_days": 3})
    assert over.status_code == 400 and "cap" in over.json()["detail"]
    assert client.post(f"/posts/{post_id}/boost", json={k: v for k, v in BOOST.items() if k != "confirm"}).status_code == 422
    assert client.post("/posts/999/boost", json=BOOST).status_code == 404
    assert not route.called


def test_boost_failure_is_saved(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    zernio_mock.post("/ads/boost").respond(
        422, json={"error": "Ads connection required", "code": "ads_connection_required"}
    )
    response = client.post(f"/posts/{post_id}/boost", json=BOOST)
    assert response.status_code == 422
    boosts = client.get(f"/posts/{post_id}/boosts").json()
    assert boosts[0]["status"] == "failed" and boosts[0]["is_success"] is False


def test_demo_account_simulates_boost(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    client.post("/demo/load")
    post_id = client.get("/posts", params={"account_id": "demo-instagram"}).json()[0]["id"]
    route = zernio_mock.post("/ads/boost").respond(201, json=ad_response())
    body = client.post(f"/posts/{post_id}/boost", json={**BOOST, "ad_account_id": "act_demo"}).json()
    assert (body["status"], body["is_success"], body["review_status"]) == ("demo", True, "pending_review")
    assert not route.called
