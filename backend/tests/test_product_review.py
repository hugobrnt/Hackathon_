from fastapi.testclient import TestClient
from sqlmodel import Session
from app.domains.accounts.service import upsert_account
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import Intent
from app.domains.content.models import Message, MessageKind, MessageDirection
from tests.test_outreach import setup_post, add_comment, add_product, PRODUCT


def test_review_queue_filters_and_paginates(client: TestClient, session: Session) -> None:
    post = setup_post(session)
    product = add_product(client)
    ids = [add_comment(session, post, str(i), str(i), intent) for i, intent in enumerate([
        Intent.purchase_intent, Intent.feature_request, Intent.neutral_spam,
        Intent.purchase_intent, Intent.purchase_intent, Intent.purchase_intent])]
    for i in [3, 4, 5]:
        m = session.get(Message, ids[i])
        assert m
        if i == 3: m.author_is_owner = True
        if i == 4: m.direction = MessageDirection.outgoing
        if i == 5:
            c = session.get(MessageClassification, ids[i])
            assert c
            c.product_id, c.product_confidence = product, .95
            session.add(c)
        session.add(m)
    dm = session.get(Message, ids[1])
    assert dm
    dm.kind, dm.post_id = MessageKind.dm, None
    session.add(dm)
    session.commit()
    url = "/accounts/acc-1/product-matches/review"
    page = client.get(url, params={"limit": 1}).json()
    assert [m["message_id"] for m in page["items"]] == [ids[1]]
    assert page["items"][0]["kind"] == "dm"
    next_page = client.get(url, params={"before": page["next_cursor"]}).json()
    assert [m["message_id"] for m in next_page["items"]] == [ids[0]]
    assert next_page["next_cursor"] is None
    scoped = client.get(url, params={"post_id": post}).json()
    assert [m["message_id"] for m in scoped["items"]] == [ids[0]]
    assert client.get("/accounts/missing/product-matches/review").status_code == 404


def test_confirm_validates_product_and_survives_reclassification(client: TestClient, session: Session) -> None:
    post = setup_post(session)
    product = add_product(client)
    message = add_comment(session, post, "buyer", "buyer", Intent.purchase_intent)
    upsert_account(session, "other", "instagram", "other", None)
    session.commit()
    foreign = client.post("/accounts/other/products", json=PRODUCT).json()["id"]
    url = f"/messages/{message}/product-match"
    assert client.put(url, json={"product_id": foreign}).status_code == 400
    assert client.put(url, json={"product_id": 999}).status_code == 400
    response = client.put(url, json={"product_id": product})
    assert response.status_code == 200
    assert response.json()["product_confidence"] == 1
    assert client.get("/accounts/acc-1/product-matches/review").json()["items"] == []
    row = session.get(MessageClassification, message)
    assert row and row.intent == Intent.purchase_intent
    client.post("/classification/run", json={"force": True})
    session.refresh(row)
    assert row.product_id == product and row.product_reason == "human confirmed"
    assert client.get("/tracking/links").json() == []
    client.delete(f"/products/{product}")
    assert client.put(url, json={"product_id": product}).status_code == 400
    assert len(client.get("/accounts/acc-1/product-matches/review").json()["items"]) == 1
