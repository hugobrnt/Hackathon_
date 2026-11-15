import json

import pytest
import respx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import Settings
from app.domains.accounts.service import upsert_account
from app.domains.classification.classifiers import WorkersAIClassifier
from app.domains.classification.heuristic import classify_heuristic
from app.domains.classification.models import MessageClassification
from app.domains.classification.schemas import ClassificationInput
from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content import repository
from app.domains.content.models import MessageDirection, MessageKind
from app.integrations.cloudflare.workers_ai import WorkersAIClient

CF_URL = "https://api.cloudflare.com/client/v4/accounts/cf-acc/ai/run/"


def cf_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"cloudflare_account_id": "cf-acc", "cloudflare_api_token": "cf-token"})


def item(text: str) -> ClassificationInput:
    return ClassificationInput(text=text, kind="comment")


@pytest.mark.parametrize(
    ("text", "intent"),
    [
        ("Je prends ! Où je commande ?", Intent.purchase_intent),
        ("C'est combien la livraison en Belgique ?", Intent.pre_purchase_question),
        ("Dispo en M le noir ?", Intent.pre_purchase_question),
        ("Un peu cher pour un hoodie franchement", Intent.objection),
        ("Ce serait top d'avoir la même en version zippée", Intent.feature_request),
        ("Je l'ai depuis 6 mois, toujours nickel", Intent.testimonial),
        ("Ma commande n'est toujours pas arrivée", Intent.support_complaint),
        ("Gagnez 1000€ par jour 👉 bit.ly/xxxx", Intent.neutral_spam),
        ("🔥🔥", Intent.neutral_spam),
    ],
)
def test_heuristic(text: str, intent: Intent) -> None:
    assert classify_heuristic(item(text)).intent == intent


def cf_response(intent: str, confidence: float) -> dict[str, object]:
    output = {"intent": intent, "sentiment": "neutral", "confidence": confidence, "rationale": "r"}
    return {"success": True, "result": {"response": output}, "errors": []}


async def test_workers_ai_small_model_is_enough(settings: Settings) -> None:
    s = cf_settings(settings)
    with respx.mock(assert_all_called=False) as mock:
        small = mock.post(CF_URL + s.classifier_small_model).respond(json=cf_response("pre_purchase_question", 0.93))
        large = mock.post(CF_URL + s.classifier_large_model).respond(json=cf_response("objection", 0.9))
        result = await WorkersAIClassifier(s).classify(item("Dispo en M ?"))
    assert (result.intent, result.escalated, result.model) == (Intent.pre_purchase_question, False, s.classifier_small_model)
    assert not large.called
    body = json.loads(small.calls.last.request.content)
    assert body["response_format"]["type"] == "json_schema"
    assert small.calls.last.request.headers["Authorization"] == "Bearer cf-token"


async def test_workers_ai_escalates_low_confidence(settings: Settings) -> None:
    s = cf_settings(settings)
    with respx.mock() as mock:
        mock.post(CF_URL + s.classifier_small_model).respond(json=cf_response("testimonial", 0.4))
        # Some models return the JSON as a string.
        output = json.dumps({"intent": "objection", "sentiment": "negative", "confidence": 0.85, "rationale": "ironie"})
        mock.post(CF_URL + s.classifier_large_model).respond(json={"success": True, "result": {"response": output}})
        result = await WorkersAIClassifier(s).classify(item("Super, encore 80€ pour un t-shirt 🙃"))
    assert (result.intent, result.sentiment, result.escalated) == (Intent.objection, Sentiment.negative, True)


async def test_workers_ai_falls_back_to_heuristic(settings: Settings) -> None:
    s = cf_settings(settings)
    with respx.mock() as mock:
        mock.post(url__startswith=CF_URL).respond(500, json={"success": False, "errors": [{"message": "boom"}]})
        result = await WorkersAIClassifier(s).classify(item("Trop cher"))
    assert (result.intent, result.fallback, result.model) == (Intent.objection, True, "heuristic")


async def test_workers_ai_through_ai_gateway(settings: Settings) -> None:
    s = cf_settings(settings).model_copy(update={"cloudflare_ai_gateway_id": "gw"})
    url = WorkersAIClient(s).model_url("@cf/meta/llama-3.1-8b-instruct")
    assert url == "https://gateway.ai.cloudflare.com/v1/cf-acc/gw/workers-ai/@cf/meta/llama-3.1-8b-instruct"


def seed(session: Session) -> int:
    upsert_account(session, "acc-1", "instagram", "karim", None)
    post = repository.upsert_post(session, account_id="acc-1", external_id="p1", platform="instagram", caption="Hoodie")
    assert post.id is not None
    for ext, text, owner in [("c1", "Je prends, où je commande ?", False), ("c2", "Merci !", True), ("c3", "Trop cher", False)]:
        repository.upsert_message(
            session, account_id="acc-1", kind=MessageKind.comment, external_id=ext, text=text, post_id=post.id,
            author_is_owner=owner, direction=MessageDirection.outgoing if owner else MessageDirection.incoming,
        )
    session.commit()
    return post.id


def test_run_classifies_incoming_only_and_is_incremental(client: TestClient, session: Session) -> None:
    post_id = seed(session)
    first = client.post("/classification/run", json={}).json()
    assert first["classified"] == 2
    assert first["by_intent"] == {"purchase_intent": 1, "objection": 1}
    assert client.post("/classification/run").json()["classified"] == 0
    assert client.post("/classification/run", json={"force": True}).json()["classified"] == 2

    messages = client.get(f"/posts/{post_id}/messages").json()
    by_ext = {m["external_id"]: m["classification"] for m in messages}
    assert by_ext["c1"]["intent"] == "purchase_intent"
    assert by_ext["c2"] is None  # Owner reply: not classified.


def test_manual_label(client: TestClient, session: Session) -> None:
    seed(session)
    message_id = session.exec(select(MessageClassification.message_id)).first()
    assert message_id is None
    from app.domains.content.models import Message

    msg = session.exec(select(Message).where(Message.external_id == "c3")).one()
    response = client.put(f"/messages/{msg.id}/classification", json={"intent": "objection", "sentiment": "negative"})
    assert response.status_code == 200
    assert (response.json()["model"], response.json()["confidence"], response.json()["needs_review"]) == ("human", 1.0, False)
    assert client.put("/messages/999/classification", json={"intent": "objection", "sentiment": "negative"}).status_code == 404


def test_webhook_comment_is_classified_in_background(client: TestClient, session: Session) -> None:
    from tests.test_webhooks import comment_event, send

    ack = send(client, comment_event()).json()
    assert len(ack["message_ids"]) == 1
    session.expire_all()
    row = session.get(MessageClassification, ack["message_ids"][0])
    assert row is not None and row.intent == Intent.pre_purchase_question


def test_demo_load_is_classified(client: TestClient, session: Session) -> None:
    client.post("/demo/load")
    session.expire_all()
    rows = session.exec(select(MessageClassification)).all()
    assert len(rows) >= 15
    assert {r.intent for r in rows} >= {Intent.purchase_intent, Intent.objection, Intent.support_complaint}
    assert all(r.needs_review for r in rows if r.intent == Intent.support_complaint)


def test_workers_ai_client_requires_credentials(settings: Settings) -> None:
    from app.integrations.cloudflare.workers_ai import WorkersAIError

    with pytest.raises(WorkersAIError):
        WorkersAIClient(settings)
