import json
from datetime import UTC, datetime, timedelta

import respx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.domains.accounts.service import upsert_account
from app.domains.classification.schemas import ClassificationOutput
from app.domains.classification.service import save_result
from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content import repository
from app.domains.content.models import MessageKind
from app.core.config import Settings
from app.domains.outreach.models import DmAttempt
from app.domains.outreach.schemas import DmDraftInput
from app.domains.outreach.writers import WorkersAIDmWriter, template_draft
from app.domains.products.models import BusinessType
from app.domains.tracking.service import base_url as tracking_base
from tests.test_webhooks import comment_event, send

LANDING = "https://shop.test/hoodie"

PRODUCT = {
    "business_type": "ecommerce",
    "title": "Hoodie bio",
    "landing_url": LANDING,
    "description": "Hoodie en coton bio, 59 euros. Tailles XS a XXL. Retours gratuits 30 jours.",
}


def add_product(client: TestClient, **extra: object) -> int:
    response = client.post("/accounts/acc-1/products", json={**PRODUCT, **extra})
    assert response.status_code == 201, response.text
    product_id: int = response.json()["id"]
    return product_id


def setup_post(session: Session) -> int:
    upsert_account(session, "acc-1", "instagram", "marko_builder", None)
    post = repository.upsert_post(session, account_id="acc-1", external_id="p1", platform="instagram", caption="Hoodie 59€")
    session.commit()
    assert post.id is not None
    return post.id


def add_comment(
    session: Session,
    post_id: int,
    external_id: str,
    author: str,
    intent: Intent,
    sentiment: Sentiment = Sentiment.neutral,
    confidence: float = 0.9,
    age: timedelta = timedelta(minutes=1),
) -> int:
    message, _ = repository.upsert_message(
        session,
        account_id="acc-1",
        kind=MessageKind.comment,
        external_id=external_id,
        text="Dispo en M ?",
        post_id=post_id,
        author_id=author,
        author_name=author,
        created_time=datetime.now(UTC) - age,
    )
    session.flush()
    assert message.id is not None
    save_result(
        session, message.id, ClassificationOutput(intent=intent, sentiment=sentiment, confidence=confidence, model="t")
    )
    session.commit()
    return message.id


def enable(client: TestClient, post_id: int, **extra: object) -> None:
    if not client.get("/accounts/acc-1/products").json():
        add_product(client)
    response = client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True, **extra})
    assert response.status_code == 200, response.text


def mock_reply(mock: respx.MockRouter, comment_id: str = "c1") -> respx.Route:
    return mock.post(f"/inbox/comments/p1/{comment_id}/private-reply").respond(
        json={"status": "success", "messageId": "mid.1", "commentId": comment_id, "platform": "instagram"}
    )


def test_settings_default_off_and_update(client: TestClient, session: Session) -> None:
    post_id = setup_post(session)
    assert client.get(f"/posts/{post_id}/auto-dm").json()["enabled"] is False
    enable(client, post_id)
    body = client.get(f"/posts/{post_id}/auto-dm").json()
    assert (body["enabled"], body["product_id"]) == (True, None)
    assert client.get("/posts/999/auto-dm").status_code == 404
    assert client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True, "product_id": 999}).status_code == 400


def test_run_sends_one_dm_per_person_and_post(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "anis", Intent.pre_purchase_question)
    add_comment(session, post_id, "c2", "anis", Intent.purchase_intent)  # Same person, same post.
    add_comment(session, post_id, "c3", "lea", Intent.testimonial)  # Not a DM intent.
    reply = mock_reply(zernio_mock)

    assert client.post(f"/posts/{post_id}/auto-dm/run").status_code == 400  # Off.
    enable(client, post_id)
    result = client.post(f"/posts/{post_id}/auto-dm/run").json()
    assert (result["processed"], result["sent"], result["skipped"]) == (2, 1, 1)

    sent = json.loads(reply.calls.last.request.content)
    assert sent["accountId"] == "acc-1"
    assert "anis" in sent["message"]
    assert LANDING not in sent["message"]  # F8: the DM contains the short tracked link.
    assert "STOP" not in sent["message"]
    attempt = next(a for a in result["attempts"] if a["status"] == "sent")
    assert attempt["tracked_url"] in sent["message"]
    assert attempt["zernio_message_id"] == "mid.1"
    assert attempt["latency_seconds"] is not None and attempt["latency_seconds"] < 600

    # Idempotent: a new run sends nothing.
    assert client.post(f"/posts/{post_id}/auto-dm/run").json()["processed"] == 0
    assert reply.call_count == 1


def test_guardrails_need_approval(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "u1", Intent.objection, sentiment=Sentiment.negative)
    add_comment(session, post_id, "c2", "u2", Intent.pre_purchase_question, confidence=0.3)
    add_comment(session, post_id, "c3", "u3", Intent.purchase_intent, age=timedelta(days=8))
    reply = mock_reply(zernio_mock)
    enable(client, post_id)
    session.expire_all()
    attempts = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"]
    by_name = {a["recipient_name"]: a for a in attempts}
    assert by_name["u1"]["status"] == "pending_approval"
    assert by_name["u2"]["status"] == "pending_approval"
    assert by_name["u3"]["status"] == "skipped" and "7 days" in by_name["u3"]["reason"]
    assert not reply.called

    queue = client.get("/auto-dm/attempts", params={"status": "pending_approval"}).json()
    assert len(queue) == 2
    approved = client.post(f"/auto-dm/attempts/{by_name['u1']['id']}/approve", json={"text": "Bonjour, merci !"}).json()
    assert (approved["status"], approved["writer"], approved["text"]) == ("sent", "human", "Bonjour, merci !")
    rejected = client.post(f"/auto-dm/attempts/{by_name['u2']['id']}/reject").json()
    assert rejected["status"] == "rejected"
    assert client.post(f"/auto-dm/attempts/{by_name['u2']['id']}/approve").status_code == 409


def test_validation_mode(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "u1", Intent.purchase_intent)
    enable(client, post_id, require_approval=True)
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert attempt["status"] == "pending_approval"
    assert attempt["tracked_url"] in attempt["text"]


def test_meta_errors(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "u1", Intent.purchase_intent)
    add_comment(session, post_id, "c2", "u2", Intent.purchase_intent)
    zernio_mock.post("/inbox/comments/p1/c1/private-reply").respond(
        429, json={"error": "Rate limited", "details": {"privateReplyOutcome": "not_sent"}}
    )
    zernio_mock.post("/inbox/comments/p1/c2/private-reply").respond(
        400, json={"error": "Already used", "details": {"privateReplyConsumed": True}}
    )
    enable(client, post_id)
    attempts = {a["recipient_name"]: a for a in client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"]}
    assert (attempts["u1"]["status"], attempts["u1"]["retryable"]) == ("failed", True)
    assert (attempts["u2"]["status"], attempts["u2"]["retryable"]) == ("failed", False)
    assert "already used" in attempts["u2"]["reason"]

    zernio_mock.post("/inbox/comments/p1/c1/private-reply").respond(json={"messageId": "mid.9"})
    assert client.post(f"/auto-dm/attempts/{attempts['u1']['id']}/approve").json()["status"] == "sent"
    assert client.post(f"/auto-dm/attempts/{attempts['u2']['id']}/approve").status_code == 409


def test_webhook_comment_triggers_auto_dm(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    enable(client, post_id)
    reply = mock_reply(zernio_mock, comment_id="c-9")
    event = comment_event()
    event["comment"]["text"] = "Je prends ! Où je commande ?"
    ack = send(client, event).json()
    assert len(ack["message_ids"]) == 1
    assert reply.called
    session.expire_all()
    attempt = session.exec(select(DmAttempt)).one()
    assert (attempt.status, attempt.intent) == ("sent", Intent.purchase_intent)


def test_webhook_comment_without_auto_dm_sends_nothing(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    setup_post(session)
    reply = mock_reply(zernio_mock, comment_id="c-9")
    send(client, comment_event())
    assert not reply.called
    assert session.exec(select(DmAttempt)).all() == []


def test_preview(client: TestClient, session: Session) -> None:
    post_id = setup_post(session)
    message_id = add_comment(session, post_id, "c1", "anis", Intent.objection)
    enable(client, post_id)
    draft = client.post(f"/messages/{message_id}/auto-dm/preview").json()
    assert draft["writer"] == "template" and draft["tracked_url"] in draft["text"]







async def test_llm_prompt_contains_product_description(settings: Settings) -> None:
    s = settings.model_copy(update={"cloudflare_account_id": "cf", "cloudflare_api_token": "t"})
    item = DmDraftInput(
        comment="Vous livrez en Suisse ?", author_name="lea", intent=Intent.pre_purchase_question, post_caption="Hoodie",
        landing_url="https://shop.test/p", business_type=BusinessType.ecommerce, product_name="Hoodie bio",
        product_description="Livraison Suisse 6,90 euros.",
    )
    with respx.mock() as mock:
        route = mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"message": "lea, oui : 6,90 euros. https://shop.test/p"}}}
        )
        draft = await WorkersAIDmWriter(s).write(item)
    prompt = json.loads(route.calls.last.request.content)["messages"][1]["content"]
    assert "Livraison Suisse 6,90 euros." in prompt and "Hoodie bio" in prompt
    assert draft.text == "lea, oui : 6,90 euros. https://shop.test/p"

    with respx.mock() as mock:  # Output without the link: template fallback.
        mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"message": "Oui on livre !"}}}
        )
        fallback = await WorkersAIDmWriter(s).write(item)
    assert fallback.writer == "template" and "https://shop.test/p" in fallback.text



async def test_saas_profile_uses_saas_prompt_and_templates(settings: Settings) -> None:
    s = settings.model_copy(update={"cloudflare_account_id": "cf", "cloudflare_api_token": "t"})
    item = DmDraftInput(
        comment="Ça marche avec Stripe ?", author_name="lea", intent=Intent.pre_purchase_question, post_caption="Build in public",
        landing_url="https://invoicebot.test", business_type=BusinessType.saas, product_name="InvoiceBot",
        product_description="InvoiceBot relance tes factures. Integration Stripe. Essai gratuit 14 jours.",
    )
    with respx.mock() as mock:
        route = mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"message": "lea, oui avec Stripe. https://invoicebot.test"}}}
        )
        await WorkersAIDmWriter(s).write(item)
    body = json.loads(route.calls.last.request.content)
    assert "SaaS" in body["messages"][0]["content"] and "Profile: saas" in body["messages"][1]["content"]

    purchase = template_draft(item.model_copy(update={"intent": Intent.purchase_intent})).text
    assert "démarrer" in purchase and "commander" not in purchase
