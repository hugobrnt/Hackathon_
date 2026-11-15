"""Classify the stored messages and save the results (F3)."""

import asyncio
import logging
from collections.abc import Sequence

from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.domains.accounts.models import utc_now
from app.domains.classification.classifiers import Classifier
from app.domains.classification.models import MessageClassification
from app.domains.classification.schemas import (
    ClassificationInput,
    ClassificationOutput,
    ClassificationRunRequest,
    ClassificationRunResult,
    ManualClassification,
)
from app.domains.classification.taxonomy import Intent
from app.domains.content.models import Message, MessageDirection, Post

from app.domains.products.matching import ProductMatcher, match_messages  # noqa: E402

logger = logging.getLogger(__name__)


def to_input(message: Message, post: Post | None) -> ClassificationInput:
    return ClassificationInput(
        text=message.text,
        kind=message.kind.value,
        is_reply=message.parent_external_id is not None,
        post_caption=post.caption if post else None,
    )


def needs_review(result: ClassificationOutput) -> bool:
    return (
        result.confidence < get_settings().classifier_review_threshold
        or result.intent == Intent.support_complaint
        or result.fallback
    )


def save_result(session: Session, message_id: int, result: ClassificationOutput) -> MessageClassification:
    row = session.get(MessageClassification, message_id) or MessageClassification(
        message_id=message_id,
        intent=result.intent,
        sentiment=result.sentiment,
        confidence=result.confidence,
        model=result.model,
    )
    row.intent = result.intent
    row.sentiment = result.sentiment
    row.confidence = round(result.confidence, 3)
    row.rationale = result.rationale[:300]
    row.model = result.model
    row.needs_review = needs_review(result)
    row.classified_at = utc_now()
    session.add(row)
    return row


def select_messages(session: Session, request: ClassificationRunRequest) -> list[Message]:
    """Incoming messages with text. The owner's own messages are not classified."""
    query = select(Message).where(
        Message.direction == MessageDirection.incoming,
        col(Message.author_is_owner).is_(False),
        Message.text != "",
    )
    if request.account_id:
        query = query.where(Message.account_id == request.account_id)
    if request.post_id is not None:
        query = query.where(Message.post_id == request.post_id)
    if not request.force:
        classified = select(MessageClassification.message_id)
        query = query.where(col(Message.id).not_in(classified))
    return list(session.exec(query.order_by(col(Message.id)).limit(request.limit)))


async def classify_messages(
    session: Session, classifier: Classifier, messages: Sequence[Message]
) -> ClassificationRunResult:
    posts: dict[int, Post | None] = {}
    for message in messages:
        if message.post_id is not None and message.post_id not in posts:
            posts[message.post_id] = session.get(Post, message.post_id)
    inputs = [to_input(m, posts.get(m.post_id) if m.post_id is not None else None) for m in messages]

    semaphore = asyncio.Semaphore(max(1, get_settings().classifier_concurrency))

    async def run(item: ClassificationInput) -> ClassificationOutput | None:
        async with semaphore:
            try:
                return await classifier.classify(item)
            except Exception:  # A failure on one message must not stop the batch.
                logger.exception("Classification failed")
                return None

    outputs = await asyncio.gather(*(run(item) for item in inputs))

    result = ClassificationRunResult()
    for message, output in zip(messages, outputs, strict=True):
        if output is None or message.id is None:
            result.failed += 1
            continue
        save_result(session, message.id, output)
        result.classified += 1
        result.escalated += int(output.escalated)
        result.fallback += int(output.fallback)
        result.by_intent[output.intent] = result.by_intent.get(output.intent, 0) + 1
    session.commit()
    return result


async def run_classification(
    session: Session,
    classifier: Classifier,
    request: ClassificationRunRequest,
    matcher: ProductMatcher | None = None,
) -> ClassificationRunResult:
    messages = select_messages(session, request)
    result = await classify_messages(session, classifier, messages)
    if matcher is not None:
        result.with_product = await match_messages(session, matcher, messages)
    return result


async def classify_in_background(
    engine: Engine,
    classifier: Classifier,
    message_ids: Sequence[int] | None = None,
    account_id: str | None = None,
    matcher: ProductMatcher | None = None,
) -> None:
    """Background task: it opens its own session, because the request session is closed."""
    with Session(engine) as session:
        if message_ids is not None:
            if not message_ids:
                return
            query = select(Message).where(
                col(Message.id).in_(message_ids),
                Message.direction == MessageDirection.incoming,
                col(Message.author_is_owner).is_(False),
                Message.text != "",
            )
            messages = list(session.exec(query))
        else:
            messages = select_messages(session, ClassificationRunRequest(account_id=account_id, limit=2000))
        result = await classify_messages(session, classifier, messages)
        if matcher is not None:
            # F7 ter: the product of each message, before the auto-DM (next background task).
            result.with_product = await match_messages(session, matcher, messages)
        logger.info("Background classification: %s", result.model_dump())


def set_manual(session: Session, message_id: int, manual: ManualClassification) -> MessageClassification:
    output = ClassificationOutput(
        intent=manual.intent, sentiment=manual.sentiment, confidence=1.0, rationale="human label", model="human"
    )
    row = save_result(session, message_id, output)
    row.needs_review = False
    session.commit()
    session.refresh(row)
    return row


def get_for_messages(session: Session, message_ids: Sequence[int]) -> dict[int, MessageClassification]:
    if not message_ids:
        return {}
    rows = session.exec(
        select(MessageClassification).where(col(MessageClassification.message_id).in_(message_ids))
    )
    return {row.message_id: row for row in rows}
