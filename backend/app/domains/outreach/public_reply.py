"""F16: after an auto-DM, reply in public under the comment.

The text is written by the LLM for each comment: language of the comment, reference to the request, no
price and no link. There is no hard-coded fallback: if the LLM fails, there is no public reply.
"""

import logging

from sqlmodel import Session

from app.domains.classification.models import MessageClassification
from app.domains.content import repository
from app.domains.content.models import Message, MessageDirection, MessageKind, Post
from app.domains.outreach.models import DmAttempt, PostAutoDm, PublicReplyStatus
from app.domains.outreach.schemas import PublicReplyInput
from app.domains.outreach.writers import DmWriter
from app.domains.products.models import Product
from app.integrations.zernio.client import ZernioClient, ZernioError

logger = logging.getLogger(__name__)


def build_input(session: Session, message: Message, product_id: int | None) -> PublicReplyInput | None:
    classification = session.get(MessageClassification, message.id)
    post = session.get(Post, message.post_id) if message.post_id is not None else None
    if classification is None or post is None:
        return None
    product = session.get(Product, product_id) if product_id is not None else None
    return PublicReplyInput(
        comment=message.text,
        author_username=message.author_name,
        intent=classification.intent,
        product_title=product.title if product else None,
        post_caption=post.caption,
    )


def _skip(attempt: DmAttempt, reason: str) -> None:
    attempt.public_reply_status = PublicReplyStatus.skipped
    attempt.public_reply_reason = reason


async def post_public_reply(
    session: Session, attempt: DmAttempt, writer: DmWriter, zernio: ZernioClient, force: bool = False
) -> DmAttempt:
    """Reply under the comment of a sent DM. `force` sends it even if the post setting is off."""
    if attempt.public_reply_status == PublicReplyStatus.sent:
        return attempt
    message = session.get(Message, attempt.message_id)
    post = session.get(Post, attempt.post_id)
    rule = session.get(PostAutoDm, attempt.post_id)
    assert message is not None and post is not None
    if not force and (rule is None or not rule.public_reply):
        return attempt  # Off for this post: nothing to record.
    item = build_input(session, message, attempt.product_id)
    text = await writer.write_public_reply(item) if item is not None else None
    if text is None:
        _skip(attempt, "No custom reply: the LLM is not available or its text was not safe.")
    else:
        attempt.public_reply_text = text
        try:
            comment_id = await zernio.reply_to_comment(
                post.external_id, message.external_id, attempt.account_id, text, f"public-reply-{attempt.id}"
            )
        except ZernioError as exc:
            attempt.public_reply_status = PublicReplyStatus.failed
            attempt.public_reply_reason = f"Zernio {exc.status_code}: {exc.message}"
            logger.warning("Public reply of DM %s failed: %s", attempt.id, exc.message)
        else:
            attempt.public_reply_status = PublicReplyStatus.sent
            attempt.public_reply_reason = None
            attempt.public_reply_comment_id = comment_id
            if comment_id:
                # Same key as the `comment.received` webhook of our own reply: no duplicate.
                repository.upsert_message(
                    session,
                    account_id=attempt.account_id,
                    kind=MessageKind.comment,
                    external_id=comment_id,
                    text=text,
                    post_id=post.id,
                    parent_external_id=message.external_id,
                    author_is_owner=True,
                    direction=MessageDirection.outgoing,
                )
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return attempt
