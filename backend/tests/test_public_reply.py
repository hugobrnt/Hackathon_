import json

import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import Settings
from app.domains.classification.taxonomy import Intent
from app.domains.content.models import Message, MessageDirection
from app.domains.outreach.schemas import PublicReplyInput
from app.domains.outreach.writers import TemplateDmWriter, WorkersAIDmWriter, clean_public_reply, get_dm_writer
from tests.test_outreach import add_comment, enable, mock_reply, setup_post

REPLY = "Bonne question sur la taille, je t'ai envoyé les détails en DM 📩"


class FakeWriter(TemplateDmWriter):
    def __init__(self, reply: str | None = REPLY) -> None:
        self.reply = reply
        self.inputs: list[PublicReplyInput] = []

    async def write_public_reply(self, item: PublicReplyInput) -> str | None:
        self.inputs.append(item)
        return self.reply


def use_writer(client: TestClient, writer: FakeWriter) -> None:
    app = client.app
    assert isinstance(app, FastAPI)
    app.dependency_overrides[get_dm_writer] = lambda: writer


def test_public_reply_after_the_dm(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    writer = FakeWriter()
    use_writer(client, writer)
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "anis", Intent.pre_purchase_question)
    mock_reply(zernio_mock)
    route = zernio_mock.post("/inbox/comments/p1").respond(
        json={"success": True, "data": {"commentId": "reply-1", "isReply": True}}
    )
    enable(client, post_id)
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert (attempt["status"], attempt["public_reply_status"]) == ("sent", "sent")
    assert (attempt["public_reply_text"], attempt["public_reply_comment_id"]) == (REPLY, "reply-1")

    request = route.calls.last.request
    assert json.loads(request.content) == {"accountId": "acc-1", "message": REPLY, "commentId": "c1"}
    assert request.headers["Idempotency-Key"] == f"public-reply-{attempt['id']}"
    assert writer.inputs[0].comment == "Dispo en M ?" and writer.inputs[0].intent == Intent.pre_purchase_question

    session.expire_all()
    stored = session.exec(select(Message).where(Message.external_id == "reply-1")).one()
    assert (stored.parent_external_id, stored.direction, stored.author_is_owner) == ("c1", MessageDirection.outgoing, True)

    # Already sent: the manual endpoint refuses a second reply.
    assert client.post(f"/auto-dm/attempts/{attempt['id']}/public-reply").status_code == 409


def test_no_public_reply_when_off_or_without_llm(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "u1", Intent.purchase_intent)
    add_comment(session, post_id, "c2", "u2", Intent.purchase_intent)
    mock_reply(zernio_mock, "c1")
    mock_reply(zernio_mock, "c2")
    route = zernio_mock.post("/inbox/comments/p1").respond(json={"data": {"commentId": "r"}})

    use_writer(client, FakeWriter(reply=None))  # The LLM gives no usable text.
    enable(client, post_id)
    attempts = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"]
    assert [a["public_reply_status"] for a in attempts] == ["skipped", "skipped"]
    assert not route.called

    post2 = setup_post(session)  # Same post: re-use it with the setting off.
    client.put(f"/posts/{post2}/auto-dm", json={"enabled": True, "public_reply": False})
    assert client.get(f"/posts/{post2}/auto-dm").json()["public_reply"] is False


def test_retry_after_failure(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    use_writer(client, FakeWriter())
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "anis", Intent.purchase_intent)
    mock_reply(zernio_mock)
    zernio_mock.post("/inbox/comments/p1").respond(422, json={"error": "Comment too old", "code": "platform_api_error"})
    enable(client, post_id)
    attempt = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"][0]
    assert attempt["status"] == "sent" and attempt["public_reply_status"] == "failed"  # The DM stays sent.

    zernio_mock.post("/inbox/comments/p1").respond(json={"data": {"commentId": "reply-2"}})
    retried = client.post(f"/auto-dm/attempts/{attempt['id']}/public-reply").json()
    assert (retried["public_reply_status"], retried["public_reply_comment_id"]) == ("sent", "reply-2")


def test_preview(client: TestClient, session: Session) -> None:
    use_writer(client, FakeWriter())
    post_id = setup_post(session)
    message_id = add_comment(session, post_id, "c1", "anis", Intent.objection)
    assert client.post(f"/messages/{message_id}/public-reply/preview").json()["text"] == REPLY


def test_clean_public_reply() -> None:
    assert clean_public_reply("  Je t'ai écrit en DM 📩 ") == "Je t'ai écrit en DM 📩"
    assert clean_public_reply("Voici le lien https://shop.test") is None
    assert clean_public_reply("C'est 59 € en DM") is None
    assert clean_public_reply("x" * 300) is None
    assert clean_public_reply("") is None


async def test_llm_public_reply(settings: Settings) -> None:
    s = settings.model_copy(update={"cloudflare_account_id": "cf", "cloudflare_api_token": "t"})
    item = PublicReplyInput(comment="Do you ship to Canada?", author_username="jo", intent=Intent.pre_purchase_question,
                            product_title="Hoodie", post_caption="Nouveau hoodie")
    with respx.mock() as mock:
        route = mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"reply": "Great question about shipping, check your DMs 📩"}}}
        )
        text = await WorkersAIDmWriter(s).write_public_reply(item)
    assert text == "Great question about shipping, check your DMs 📩"
    body = json.loads(route.calls.last.request.content)
    assert "SAME language as the comment" in body["messages"][0]["content"]
    assert "Comment: Do you ship to Canada?" in body["messages"][1]["content"]
