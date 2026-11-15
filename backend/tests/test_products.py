import json

import respx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import Settings
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import Intent
from app.domains.products.matching import CatalogItem, MatchInput, WorkersAIProductMatcher, match_heuristic
from tests.test_outreach import PRODUCT, add_comment, add_product, mock_reply, setup_post

ZIP = {
    "business_type": "ecommerce",
    "title": "Hoodie zippé",
    "landing_url": "https://shop.test/zip",
    "description": "Version zippée du hoodie, fermeture éclair, deux poches, 69 euros.",
}


def test_catalog_crud(client: TestClient, session: Session) -> None:
    setup_post(session)
    assert client.get("/accounts/acc-1/products").json() == []
    first = add_product(client)
    second = add_product(client, **ZIP)
    assert [p["title"] for p in client.get("/accounts/acc-1/products").json()] == ["Hoodie bio", "Hoodie zippé"]

    updated = client.put(f"/products/{second}", json={**ZIP, "title": "Hoodie zippé noir"}).json()
    assert updated["title"] == "Hoodie zippé noir"
    assert client.delete(f"/products/{first}").json()["is_active"] is False
    active = client.get("/accounts/acc-1/products", params={"active_only": True}).json()
    assert [p["id"] for p in active] == [second]

    assert client.post("/accounts/nope/products", json=PRODUCT).status_code == 404
    assert client.get("/products/999").status_code == 404
    assert client.post("/accounts/acc-1/products", json={**PRODUCT, "description": "court"}).status_code == 422
    assert client.post("/accounts/acc-1/products", json={**PRODUCT, "landing_url": "pas une url"}).status_code == 422
    assert client.post("/accounts/acc-1/products", json={**PRODUCT, "business_type": "b2b"}).status_code == 422
    saas = client.post("/accounts/acc-1/products", json={**PRODUCT, "business_type": "saas"}).json()
    assert saas["business_type"] == "saas"


def test_enable_requires_a_product(client: TestClient, session: Session) -> None:
    post_id = setup_post(session)
    response = client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    assert response.status_code == 400 and "catalog" in response.json()["detail"]
    assert client.put(f"/posts/{post_id}/auto-dm", json={"enabled": False}).status_code == 200
    add_product(client)
    assert client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True}).status_code == 200


def test_heuristic_matching() -> None:
    catalog = [
        CatalogItem(id=1, title="Hoodie noir", description="Hoodie coton bio noir et gris"),
        CatalogItem(id=2, title="Hoodie zippé", description="Version zippée, fermeture éclair"),
    ]
    assert match_heuristic(MatchInput(comment="Vous l'avez en zippé ?", post_caption="", catalog=catalog)).product_id == 2
    assert match_heuristic(MatchInput(comment="🔥", post_caption="", catalog=catalog)).product_id is None


async def test_llm_matching(settings: Settings) -> None:
    s = settings.model_copy(update={"cloudflare_account_id": "cf", "cloudflare_api_token": "t"})
    item = MatchInput(
        comment="Il me le faut en zippé", post_caption="Nouveau hoodie noir",
        catalog=[CatalogItem(id=4, title="Hoodie noir", description="d"), CatalogItem(id=7, title="Hoodie zippé", description="d")],
    )
    with respx.mock() as mock:
        route = mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"product_id": 7, "confidence": 0.9, "reason": "zippé"}}}
        )
        result = await WorkersAIProductMatcher(s).match(item)
    assert (result.product_id, result.confidence) == (7, 0.9)
    assert "id 7: Hoodie zippé" in json.loads(route.calls.last.request.content)["messages"][1]["content"]

    with respx.mock() as mock:  # Unknown id: no product.
        mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"product_id": 99, "confidence": 0.8, "reason": "?"}}}
        )
        assert (await WorkersAIProductMatcher(s).match(item)).product_id is None


def test_classification_finds_the_product(client: TestClient, session: Session) -> None:
    post_id = setup_post(session)
    add_product(client)
    zip_id = add_product(client, **ZIP)
    message_id = add_comment(session, post_id, "c1", "u1", Intent.purchase_intent)
    message = session.get(MessageClassification, message_id)
    assert message is not None
    from app.domains.content.models import Message

    comment = session.get(Message, message_id)
    assert comment is not None
    comment.text = "Je prends la version zippée !"
    session.add(comment)
    session.commit()
    result = client.post("/classification/run", json={"force": True}).json()
    assert result["with_product"] == 1
    messages = client.get(f"/posts/{post_id}/messages").json()
    classification = messages[0]["classification"]
    assert (classification["product_id"], classification["product_title"]) == (zip_id, "Hoodie zippé")


def test_dm_goes_to_the_product_of_the_comment(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    post_id = setup_post(session)
    add_product(client)
    zip_id = add_product(client, **ZIP)
    message_id = add_comment(session, post_id, "c1", "anis", Intent.purchase_intent)
    row = session.get(MessageClassification, message_id)
    assert row is not None
    row.product_id = zip_id
    row.product_confidence = 0.95
    session.add(row)
    session.commit()
    reply = mock_reply(zernio_mock)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert (attempt["status"], attempt["product_id"], attempt["product_title"]) == ("sent", zip_id, "Hoodie zippé")
    assert "Hoodie zippé" in json.loads(reply.calls.last.request.content)["message"]
    link = client.get("/tracking/links").json()[0]
    assert link["destination_url"].startswith("https://shop.test/zip") and link["product_id"] == zip_id
    stats = client.get("/tracking/stats").json()
    assert stats["products"][0]["product_title"] == "Hoodie zippé"


def test_unknown_product_waits_for_a_human_choice(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    post_id = setup_post(session)
    add_product(client)
    zip_id = add_product(client, **ZIP)
    add_comment(session, post_id, "c1", "anis", Intent.purchase_intent)  # No product found.
    reply = mock_reply(zernio_mock)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert attempt["status"] == "pending_approval" and "Product not identified" in attempt["reason"]
    assert attempt["text"] == "" and not reply.called

    sent = client.post(f"/auto-dm/attempts/{attempt['id']}/approve", json={"product_id": zip_id}).json()
    assert (sent["status"], sent["product_id"]) == ("sent", zip_id)
    assert "Hoodie zippé" in sent["text"]


def test_product_forced_on_the_post(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_product(client)
    zip_id = add_product(client, **ZIP)
    add_comment(session, post_id, "c1", "anis", Intent.purchase_intent)
    mock_reply(zernio_mock)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True, "product_id": zip_id})
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert (attempt["status"], attempt["product_id"]) == ("sent", zip_id)


def test_demo_has_a_catalog(client: TestClient) -> None:
    client.post("/demo/load")
    titles = [p["title"] for p in client.get("/accounts/demo-instagram/products").json()]
    assert len(titles) == 3 and "Hoodie zippé" in titles
    client.post("/demo/load")
    assert len(client.get("/accounts/demo-instagram/products").json()) == 3  # Idempotent.


def test_low_confidence_product_requires_review(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_product(client)
    product_id = add_product(client, **ZIP)
    message_id = add_comment(session, post_id, "c1", "buyer", Intent.purchase_intent)
    row = session.get(MessageClassification, message_id)
    assert row is not None
    row.product_id, row.product_confidence = product_id, 0.5
    session.add(row)
    session.commit()
    reply = mock_reply(zernio_mock)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert attempt["status"] == "pending_approval"
    assert "Uncertain product" in attempt["reason"]
    assert not reply.called


def test_human_product_preview_and_edited_reply_keep_destination(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_product(client)
    product_id = add_product(client, **ZIP)
    message_id = add_comment(session, post_id, "c1", "buyer", Intent.purchase_intent)
    mock_reply(zernio_mock)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert client.post(f"/auto-dm/attempts/{attempt['id']}/approve", json={"text":"Wrongly unassigned reply"}).status_code == 400
    draft = client.post(f"/messages/{message_id}/auto-dm/preview?product_id={product_id}").json()
    response = client.post(f"/auto-dm/attempts/{attempt['id']}/approve", json={"product_id":product_id,"text":draft["text"]})
    assert response.status_code == 200
    assert response.json()["tracked_link_code"] == draft["tracked_link_code"]
    assert client.get("/tracking/links").json()[0]["destination_url"].startswith("https://shop.test/zip")
