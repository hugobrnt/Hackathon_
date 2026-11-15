import json
from collections.abc import Mapping
from typing import Any

import httpx
import respx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.domains.accounts.service import upsert_account
from app.domains.content import repository
from app.domains.content.models import Message, MessageDirection, MessageKind, Post
from app.domains.webhooks.service import compute_signature

SECRET = "whsec-test"


def send(client: TestClient, payload: Mapping[str, Any], secret: str = SECRET) -> httpx.Response:
    body = json.dumps(payload).encode()
    response: httpx.Response = client.post(
        "/webhooks/zernio",
        content=body,
        headers={"Content-Type": "application/json", "X-Zernio-Signature": compute_signature(secret, body)},
    )
    return response


def comment_event(event_id: str = "evt-1", comment_id: str = "c-9", own: bool = False) -> dict[str, Any]:
    return {
        "id": event_id,
        "event": "comment.received",
        "timestamp": "2026-11-15T12:00:00Z",
        "comment": {
            "id": comment_id,
            "postId": None,
            "platformPostId": "p1",
            "platform": "instagram",
            "text": "C'est combien ?",
            "author": {"id": "u1", "username": "anis.djl", "isOwnAccount": own},
            "createdAt": "2026-11-15T11:59:58Z",
            "isReply": False,
            "parentCommentId": None,
        },
        "post": {"platformPostId": "p1", "content": "2 days in Bangkok", "permalink": "https://instagram.com/p/x"},
        "account": {"id": "acc-1", "accountId": "acc-1", "platform": "instagram", "username": "marko_builder"},
    }


def test_comment_received_is_stored_once(client: TestClient, session: Session) -> None:
    first = send(client, comment_event())
    assert first.status_code == 200
    body = first.json()
    assert body["status"] == "processed" and len(body["message_ids"]) == 1

    again = send(client, comment_event()).json()
    assert again["status"] == "duplicate"
    # Same comment, new event id (for example after a redelivery): no new message.
    other = send(client, comment_event(event_id="evt-2")).json()
    assert other["message_ids"] == []

    session.expire_all()
    post = session.exec(select(Post)).one()
    assert (post.external_id, post.caption, post.comment_count) == ("p1", "2 days in Bangkok", 1)
    message = session.exec(select(Message)).one()
    assert (message.kind, message.author_name, message.direction) == (
        MessageKind.comment, "anis.djl", MessageDirection.incoming
    )


def test_comment_does_not_overwrite_imported_post(client: TestClient, session: Session) -> None:
    upsert_account(session, "acc-1", "instagram", "marko_builder", None)
    repository.upsert_post(
        session, account_id="acc-1", external_id="p1", platform="instagram", caption="Imported", like_count=42
    )
    session.commit()
    send(client, comment_event(own=True))
    session.expire_all()
    post = session.exec(select(Post)).one()
    assert (post.caption, post.like_count) == ("Imported", 42)
    assert session.exec(select(Message)).one().direction == MessageDirection.outgoing


def test_message_received_uses_platform_message_id(client: TestClient, session: Session) -> None:
    payload = {
        "id": "evt-dm-1",
        "event": "message.received",
        "message": {
            "id": "zernio-msg-1",
            "platformMessageId": "mid.123",
            "conversationId": "conv-1",
            "platform": "instagram",
            "direction": "incoming",
            "text": "Dispo en M ?",
            "sender": {"id": "u1", "username": "anis.djl"},
            "sentAt": "2026-11-15T12:01:00Z",
        },
        "account": {"accountId": "acc-1", "platform": "instagram"},
    }
    assert send(client, payload).json()["status"] == "processed"
    message = session.exec(select(Message)).one()
    assert (message.kind, message.external_id, message.conversation_id) == (MessageKind.dm, "mid.123", "conv-1")


def test_standby_message_is_ignored(client: TestClient, session: Session) -> None:
    payload = {
        "id": "evt-dm-2",
        "event": "message.received",
        "message": {"id": "m2", "conversationId": "conv-1", "text": "hello"},
        "account": {"accountId": "acc-1"},
        "metadata": {"standby": True},
    }
    assert send(client, payload).json()["status"] == "ignored"
    assert session.exec(select(Message)).all() == []


def test_other_events_are_ignored(client: TestClient) -> None:
    payload = {"id": "evt-t", "event": "webhook.test", "message": "This is a test webhook from Zernio"}
    assert send(client, payload).json()["status"] == "ignored"


def test_bad_signature_is_rejected(client: TestClient) -> None:
    assert send(client, comment_event(), secret="wrong").status_code == 401
    assert client.post("/webhooks/zernio", json=comment_event()).status_code == 401


def test_invalid_payload_returns_422(client: TestClient) -> None:
    assert send(client, {"id": "evt-x", "event": "comment.received"}).status_code == 422


def test_register_creates_then_updates(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/webhooks/settings").respond(json={"webhooks": []})
    created = zernio_mock.post("/webhooks/settings").respond(
        json={"success": True, "webhook": {"_id": "wh-1", "url": "https://tunnel.test/webhooks/zernio",
                                           "events": ["comment.received", "message.received", "message.sent"]}}
    )
    response = client.post("/webhooks/register", json={"public_url": "https://tunnel.test/"})
    assert response.status_code == 200
    assert response.json()["created"] is True
    sent = json.loads(created.calls.last.request.content)
    assert sent["url"] == "https://tunnel.test/webhooks/zernio"
    assert sent["secret"] == SECRET
    assert "comment.received" in sent["events"]

    zernio_mock.get("/webhooks/settings").respond(
        json={"webhooks": [{"_id": "wh-1", "name": "social-intent-converter", "url": "https://old.test/webhooks/zernio"}]}
    )
    updated = zernio_mock.put("/webhooks/settings").respond(
        json={"success": True, "webhook": {"_id": "wh-1", "url": "https://tunnel.test/webhooks/zernio"}}
    )
    response = client.post("/webhooks/register", json={"public_url": "https://tunnel.test"})
    assert response.json()["created"] is False
    assert json.loads(updated.calls.last.request.content)["webhookId"] == "wh-1"


def test_register_rejects_localhost(client: TestClient) -> None:
    assert client.post("/webhooks/register", json={"public_url": "http://localhost:8000"}).status_code == 400


def test_send_test_webhook(client: TestClient, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/webhooks/settings").respond(
        json={"webhooks": [{"_id": "wh-1", "name": "social-intent-converter", "url": "https://t/webhooks/zernio"}]}
    )
    test_route = zernio_mock.post("/webhooks/test").respond(json={"message": "Test webhook sent successfully"})
    assert client.post("/webhooks/test").json() == {"webhook_id": "wh-1", "sent": True}
    assert json.loads(test_route.calls.last.request.content) == {"webhookId": "wh-1"}
