"""Reception and registration of the Zernio webhooks (F2)."""

import hashlib
import hmac
import json

from pydantic import ValidationError
from sqlmodel import Session

from app.domains.accounts.models import SocialAccount
from app.domains.accounts.service import upsert_account
from app.domains.content import repository
from app.domains.conversations import service as conversations
from app.domains.content.models import MessageDirection, MessageKind
from app.domains.webhooks.models import WebhookEvent
from app.domains.webhooks.schemas import (
    AckStatus,
    CommentReceivedEvent,
    MessageEvent,
    WebhookAccount,
    WebhookAck,
    WebhookEnvelope,
    WebhookRegistration,
)
from app.integrations.zernio.client import ZernioClient
from app.integrations.zernio.schemas import WebhookSettings

WEBHOOK_NAME = "social-intent-converter"
WEBHOOK_PATH = "/webhooks/zernio"
SUBSCRIBED_EVENTS = ["comment.received", "message.received", "message.sent"]


class InvalidPayloadError(Exception):
    pass


def compute_signature(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def is_valid_signature(secret: str, body: bytes, signature: str | None) -> bool:
    if not secret or not signature:
        return False
    received = signature.strip().lower().removeprefix("sha256=")
    return hmac.compare_digest(compute_signature(secret, body), received)


def _ensure_account(session: Session, account: WebhookAccount, platform: str | None) -> SocialAccount:
    existing = session.get(SocialAccount, account.account_id)
    if existing is not None:
        return existing
    return upsert_account(
        session, account.account_id, account.platform or platform or "unknown", account.username, None
    )


def _handle_comment(session: Session, event: CommentReceivedEvent) -> list[int]:
    comment = event.comment
    account = _ensure_account(session, event.account, comment.platform)
    post = repository.get_or_create_post(
        session,
        account_id=account.id,
        external_id=comment.platform_post_id,
        platform=comment.platform or account.platform,
        caption=event.post.content if event.post else None,
        permalink=event.post.permalink if event.post else None,
        picture=event.post.image_url if event.post else None,
    )
    author = comment.author
    is_owner = bool(author and author.is_own_account)
    message, created = repository.upsert_message(
        session,
        account_id=account.id,
        kind=MessageKind.comment,
        external_id=comment.id,
        text=comment.text or "",
        post_id=post.id,
        parent_external_id=comment.parent_comment_id,
        author_id=author.id if author else None,
        author_name=(author.username or author.name) if author else None,
        author_is_owner=is_owner,
        direction=MessageDirection.outgoing if is_owner else MessageDirection.incoming,
        created_time=comment.created_at,
    )
    if created:
        post.comment_count += 1
        session.add(post)
    session.flush()
    return [message.id] if created and message.id is not None else []


def _handle_message(session: Session, event: MessageEvent) -> list[int]:
    dm = event.message
    account = _ensure_account(session, event.account, dm.platform)
    outgoing = event.event == "message.sent" or dm.direction == "outgoing"
    sender = dm.sender
    message, created = repository.upsert_message(
        session,
        account_id=account.id,
        kind=MessageKind.dm,
        # The import uses the platform message id: use the same key to avoid duplicates.
        external_id=dm.platform_message_id or dm.id,
        text=dm.text or "",
        conversation_id=dm.conversation_id,
        author_id=sender.id if sender else None,
        author_name=(sender.username or sender.name) if sender else None,
        author_is_owner=outgoing,
        direction=MessageDirection.outgoing if outgoing else MessageDirection.incoming,
        created_time=dm.sent_at,
    )
    session.flush()
    if outgoing and dm.platform_message_id:
        # F13: the `message.sent` of an auto-DM gives the Zernio id of its conversation.
        conversations.link_outgoing(session, dm.platform_message_id, dm.conversation_id)
    return [message.id] if created and message.id is not None else []


def process_event(session: Session, body: bytes) -> WebhookAck:
    """Store the event once (dedupe on the event id), then store its comment or DM."""
    try:
        raw = json.loads(body)
        envelope = WebhookEnvelope.model_validate(raw)
    except (ValueError, ValidationError) as exc:
        raise InvalidPayloadError(str(exc)) from exc

    if session.get(WebhookEvent, envelope.id) is not None:
        return WebhookAck(status=AckStatus.duplicate, event=envelope.event)

    record = WebhookEvent(id=envelope.id, event=envelope.event)
    message_ids: list[int] = []
    status = AckStatus.processed
    try:
        if envelope.event == "comment.received":
            comment_event = CommentReceivedEvent.model_validate(raw)
            record.account_id = comment_event.account.account_id
            message_ids = _handle_comment(session, comment_event)
        elif envelope.event in ("message.received", "message.sent"):
            message_event = MessageEvent.model_validate(raw)
            record.account_id = message_event.account.account_id
            if message_event.metadata and message_event.metadata.get("standby") is True:
                status = AckStatus.ignored  # Another app owns the thread.
            else:
                message_ids = _handle_message(session, message_event)
        else:
            status = AckStatus.ignored
    except ValidationError as exc:
        session.rollback()
        raise InvalidPayloadError(str(exc)) from exc

    record.status = status.value
    session.add(record)
    session.commit()
    return WebhookAck(status=status, event=envelope.event, message_ids=message_ids)


def _find_webhook(webhooks: list[WebhookSettings], url: str) -> WebhookSettings | None:
    for webhook in webhooks:
        if webhook.url.rstrip("/") == url or webhook.name == WEBHOOK_NAME:
            return webhook
    return None


async def register_webhook(client: ZernioClient, public_url: str, secret: str) -> WebhookRegistration:
    """Create the webhook in Zernio, or update it if it exists (same name or same URL)."""
    url = public_url.rstrip("/") + WEBHOOK_PATH
    existing = _find_webhook(await client.list_webhooks(), url)
    if existing is None:
        webhook = await client.create_webhook(WEBHOOK_NAME, url, SUBSCRIBED_EVENTS, secret)
    else:
        webhook = await client.update_webhook(existing.id, WEBHOOK_NAME, url, SUBSCRIBED_EVENTS, secret)
    return WebhookRegistration(
        webhook_id=webhook.id,
        url=webhook.url,
        events=webhook.events or SUBSCRIBED_EVENTS,
        created=existing is None,
    )


async def find_registered_webhook(client: ZernioClient) -> WebhookSettings | None:
    for webhook in await client.list_webhooks():
        if webhook.name == WEBHOOK_NAME:
            return webhook
    return None
