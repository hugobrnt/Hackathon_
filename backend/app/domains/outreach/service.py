"""Auto-DM (F7): send a private reply to the authors of purchase, question and objection comments.

Guardrails of the PRD:
- One DM per person and per post (`ACTIVE_STATUSES`), and one attempt per comment (unique `message_id`).
- No DM without human approval if the comment is negative, uncertain (`needs_review`) or if the post asks for it.
- Meta: one private reply per comment, at most 7 days after the comment.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.core.config import Settings, get_settings
from app.domains.accounts.models import utc_now
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import DM_INTENTS, Sentiment
from app.domains.content.models import Message, MessageDirection, MessageKind, Post
from app.domains.outreach.models import ACTIVE_STATUSES, DmAttempt, DmStatus, PostAutoDm
from app.domains.outreach.schemas import (
    AutoDmRunResult,
    AutoDmSettingsUpdate,
    DmAttemptRead,
    DmDraft,
    DmDraftInput,
)
from app.domains.outreach.writers import DmWriter
from app.domains.products.models import Product
from app.domains.tracking import service as tracking
from app.domains.tracking.models import TrackedLink
from app.integrations.zernio.client import ZernioClient, ZernioClientFactory, ZernioError

logger = logging.getLogger(__name__)


class OutreachError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def to_read(attempt: DmAttempt, session: Session | None = None) -> DmAttemptRead:
    item = DmAttemptRead.model_validate(attempt)
    if attempt.tracked_link_code:
        item.tracked_url = tracking.short_url(attempt.tracked_link_code)  # Click counter URL.
        link = session.get(TrackedLink, attempt.tracked_link_code) if session is not None else None
        item.link_clicks = link.click_count if link is not None else 0
    sent, comment = _as_utc(attempt.sent_at), _as_utc(attempt.comment_time)
    if sent and comment:
        item.latency_seconds = round((sent - comment).total_seconds(), 1)
    return item


# Settings per post


def get_post_settings(session: Session, post_id: int) -> PostAutoDm:
    if session.get(Post, post_id) is None:
        raise OutreachError(404, "Post not found.")
    return session.get(PostAutoDm, post_id) or PostAutoDm(post_id=post_id)


NO_PRODUCT = (
    "No product: describe it first with PUT /accounts/{account_id}/product "
    "(profile, landing URL and description are required for the automatic DMs)."
)


def product_for(session: Session, post: Post) -> Product | None:
    """The product of the account, only if it has the required URL and description (F7 bis)."""
    product = session.get(Product, post.account_id)
    if product is None or not product.landing_url or not product.description.strip():
        return None
    return product


def landing_url_for(product: Product, rule: PostAutoDm | None) -> str:
    """The post override first, then the landing URL of the product."""
    return rule.landing_url if rule is not None and rule.landing_url else product.landing_url


def set_post_settings(session: Session, post_id: int, update: AutoDmSettingsUpdate) -> PostAutoDm:
    row = get_post_settings(session, post_id)
    post = session.get(Post, post_id)
    assert post is not None
    if update.enabled and product_for(session, post) is None:
        raise OutreachError(400, NO_PRODUCT)
    row.enabled = update.enabled
    row.landing_url = str(update.landing_url) if update.landing_url else None
    row.require_approval = update.require_approval
    row.updated_at = utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# Decision


def _already_contacted(session: Session, post_id: int, recipient_id: str, message_id: int) -> bool:
    query = select(DmAttempt.id).where(
        DmAttempt.post_id == post_id,
        DmAttempt.recipient_id == recipient_id,
        DmAttempt.message_id != message_id,
        col(DmAttempt.status).in_(ACTIVE_STATUSES),
    )
    return session.exec(query).first() is not None


def _decide(
    session: Session,
    message: Message,
    classification: MessageClassification,
    rule: PostAutoDm,
    settings: Settings,
) -> tuple[DmStatus, str | None]:
    if not message.author_id:
        return DmStatus.skipped, "The comment has no author id."
    created = _as_utc(message.created_time)
    if created and utc_now() - created > timedelta(days=settings.auto_dm_max_age_days):
        return DmStatus.skipped, f"The comment is older than {settings.auto_dm_max_age_days} days (Meta limit)."
    assert message.post_id is not None and message.id is not None
    post = session.get(Post, message.post_id)
    if post is None or product_for(session, post) is None:
        return DmStatus.skipped, "No product (landing URL and description) for this account."
    if _already_contacted(session, message.post_id, message.author_id, message.id):
        return DmStatus.skipped, "This person already has a DM for this post."
    if rule.require_approval:
        return DmStatus.pending_approval, "Validation mode is on for this post."
    if classification.sentiment == Sentiment.negative:
        return DmStatus.pending_approval, "Negative comment: a human must approve the DM."
    if classification.needs_review:
        return DmStatus.pending_approval, "Uncertain classification: a human must approve the DM."
    return DmStatus.sending, None


async def draft_for(
    session: Session, message: Message, classification: MessageClassification, writer: DmWriter
) -> DmDraft:
    post = session.get(Post, message.post_id) if message.post_id is not None else None
    if post is None:
        raise OutreachError(409, "The message is not a comment on a post.")
    product = product_for(session, post)
    if product is None:
        raise OutreachError(409, NO_PRODUCT)
    rule = session.get(PostAutoDm, post.id)
    # F8: the DM contains a short tracked link, which redirects to the landing URL with UTM parameters.
    link = tracking.link_for_comment(
        session, message, post, landing_url_for(product, rule), classification.intent.value
    )
    url = tracking.dm_url(link)
    draft = await writer.write(
        DmDraftInput(
            comment=message.text,
            author_name=message.author_name,
            intent=classification.intent,
            post_caption=post.caption,
            landing_url=url,
            business_type=product.business_type,
            product_name=product.name,
            product_description=product.description,
        )
    )
    return draft.model_copy(update={"tracked_link_code": link.code, "tracked_url": url})


# Sending


async def _send(session: Session, attempt: DmAttempt, zernio: ZernioClient) -> DmAttempt:
    message = session.get(Message, attempt.message_id)
    post = session.get(Post, attempt.post_id)
    assert message is not None and post is not None
    attempt.status = DmStatus.sending
    session.add(attempt)
    session.commit()
    try:
        result = await zernio.send_private_reply(post.external_id, message.external_id, attempt.account_id, attempt.text)
    except ZernioError as exc:
        attempt.status = DmStatus.failed
        outcome = exc.details.get("privateReplyOutcome")
        attempt.retryable = exc.status_code == 429 and outcome in (None, "not_sent")
        if exc.details.get("privateReplyConsumed"):
            attempt.reason = "Meta: the private reply of this comment is already used."
        elif outcome == "unknown":
            attempt.reason = "Meta error after the send: the DM is probably delivered. Check the conversation."
        else:
            attempt.reason = f"Zernio {exc.status_code}: {exc.message}"
        logger.warning("Auto-DM %s failed: %s", attempt.id, attempt.reason)
    else:
        attempt.status = DmStatus.sent
        attempt.reason = None
        attempt.retryable = False
        attempt.zernio_message_id = result.message_id
        attempt.sent_at = utc_now()
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return attempt


async def process_message(
    session: Session, message_id: int, writer: DmWriter, zernio: ZernioClient
) -> DmAttempt | None:
    """Create and maybe send the DM of one comment. Returns None if the comment is not a target."""
    settings = get_settings()
    message = session.get(Message, message_id)
    if (
        message is None
        or message.kind != MessageKind.comment
        or message.direction != MessageDirection.incoming
        or message.author_is_owner
        or message.post_id is None
    ):
        return None
    existing = session.exec(select(DmAttempt).where(DmAttempt.message_id == message_id)).first()
    if existing is not None:
        return existing
    classification = session.get(MessageClassification, message_id)
    if classification is None or classification.intent not in DM_INTENTS:
        return None
    rule = session.get(PostAutoDm, message.post_id)
    if rule is None or not rule.enabled:
        return None

    status, reason = _decide(session, message, classification, rule, settings)
    attempt = DmAttempt(
        message_id=message_id,
        account_id=message.account_id,
        post_id=message.post_id,
        recipient_id=message.author_id,
        recipient_name=message.author_name,
        intent=classification.intent,
        status=DmStatus.skipped if status == DmStatus.sending else status,
        reason=reason,
        comment_time=message.created_time,
    )
    if status != DmStatus.skipped:
        draft = await draft_for(session, message, classification, writer)
        attempt.text, attempt.writer = draft.text, draft.writer
        attempt.tracked_link_code = draft.tracked_link_code
    try:
        session.add(attempt)
        session.commit()
    except IntegrityError:
        # Another task created the attempt of this comment first.
        session.rollback()
        return session.exec(select(DmAttempt).where(DmAttempt.message_id == message_id)).first()
    session.refresh(attempt)
    if status == DmStatus.sending:
        return await _send(session, attempt, zernio)
    return attempt


async def run_for_messages(
    session: Session, message_ids: Sequence[int], writer: DmWriter, zernio: ZernioClient
) -> AutoDmRunResult:
    result = AutoDmRunResult()
    for message_id in message_ids:
        attempt = await process_message(session, message_id, writer, zernio)
        if attempt is None:
            continue
        result.processed += 1
        result.attempts.append(to_read(attempt, session))
        if attempt.status == DmStatus.sent:
            result.sent += 1
        elif attempt.status == DmStatus.pending_approval:
            result.pending_approval += 1
        elif attempt.status == DmStatus.failed:
            result.failed += 1
        else:
            result.skipped += 1
    return result


async def run_for_post(session: Session, post_id: int, writer: DmWriter, zernio: ZernioClient) -> AutoDmRunResult:
    """Manual run: DM the eligible comments of a post without attempt (if the webhooks failed)."""
    rule = get_post_settings(session, post_id)
    if not rule.enabled:
        raise OutreachError(400, "Auto-DM is off for this post. Enable it with PUT /posts/{post_id}/auto-dm.")
    done = select(DmAttempt.message_id)
    query = (
        select(Message.id)
        .join(MessageClassification, col(MessageClassification.message_id) == col(Message.id))
        .where(
            Message.post_id == post_id,
            col(MessageClassification.intent).in_(list(DM_INTENTS)),
            col(Message.id).not_in(done),
        )
        .order_by(col(Message.created_time))
    )
    ids = [i for i in session.exec(query) if i is not None]
    return await run_for_messages(session, ids, writer, zernio)


async def auto_dm_in_background(
    engine: Engine, writer: DmWriter, zernio_factory: ZernioClientFactory, message_ids: Sequence[int]
) -> None:
    """Background task after the classification of new comments (webhook path)."""
    if not message_ids:
        return
    with Session(engine) as session:
        async with zernio_factory() as zernio:
            result = await run_for_messages(session, message_ids, writer, zernio)
    if result.processed:
        logger.info("Auto-DM: %s", result.model_dump(exclude={"attempts"}))


# Human validation


def _get_attempt(session: Session, attempt_id: int) -> DmAttempt:
    attempt = session.get(DmAttempt, attempt_id)
    if attempt is None:
        raise OutreachError(404, "DM not found.")
    return attempt


async def approve(session: Session, attempt_id: int, text: str | None, zernio: ZernioClient) -> DmAttempt:
    attempt = _get_attempt(session, attempt_id)
    if not (attempt.status == DmStatus.pending_approval or (attempt.status == DmStatus.failed and attempt.retryable)):
        raise OutreachError(409, f"The DM cannot be sent: its status is {attempt.status.value}.")
    if text:
        attempt.text = text.strip()
        attempt.writer = "human"
    if not attempt.text:
        raise OutreachError(400, "The DM has no text. Send a text in the request.")
    return await _send(session, attempt, zernio)


def reject(session: Session, attempt_id: int) -> DmAttempt:
    attempt = _get_attempt(session, attempt_id)
    if attempt.status != DmStatus.pending_approval:
        raise OutreachError(409, f"Only a pending DM can be rejected (status: {attempt.status.value}).")
    attempt.status = DmStatus.rejected
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return attempt


def list_attempts(
    session: Session,
    account_id: str | None = None,
    post_id: int | None = None,
    status: DmStatus | None = None,
    limit: int = 100,
) -> list[DmAttempt]:
    query = select(DmAttempt)
    if account_id:
        query = query.where(DmAttempt.account_id == account_id)
    if post_id is not None:
        query = query.where(DmAttempt.post_id == post_id)
    if status is not None:
        query = query.where(DmAttempt.status == status)
    return list(session.exec(query.order_by(col(DmAttempt.created_at).desc()).limit(limit)))
