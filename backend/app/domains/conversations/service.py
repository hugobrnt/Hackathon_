"""F13: follow the DM conversations started by an auto-DM, and let the agent answer the prospect.

Guardrails:
- At most `AGENT_MAX_REPLIES` automatic replies, then a human takes over.
- A complaint, a negative message, a request for a human, or an LLM failure → a human takes over.
- "stop" (or a request to stop) → the conversation is closed: no more message.
"""

import logging
import re
import uuid
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.domains.accounts.models import utc_now
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content import repository
from app.domains.content.models import Message, MessageDirection, MessageKind, Post
from app.domains.conversations.agent import AgentInput, AgentProduct, AgentTurn, ConversationAgent
from app.domains.conversations.models import AGENT_STATUSES, AgentConversation, ConversationStatus
from app.domains.conversations.schemas import ConversationDetail, ConversationSummary, SentBy, ThreadMessage
from app.domains.outreach.models import DmAttempt
from app.domains.products.models import Product
from app.domains.products.service import active_catalog
from app.domains.tracking import service as tracking
from app.domains.tracking.models import TrackedLink
from app.integrations.zernio.client import ZernioClient, ZernioClientFactory, ZernioError

logger = logging.getLogger(__name__)

LINK_WINDOW = timedelta(days=7)

_STOP = re.compile(
    r"\bstop\b|\barr[eê]te[rz]?\b|ne m'[ée]cri(s|vez) plus|plus de messages?|d[ée]sabonne|unsubscribe|leave me alone",
    re.IGNORECASE,
)
_HUMAN = re.compile(
    r"\b(humain|vraie personne|quelqu'un de r[ée]el|conseill[eè]re?|service client|real person|human|agent)\b",
    re.IGNORECASE,
)


class ConversationError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


# Creation and link


def start_for_attempt(session: Session, attempt: DmAttempt) -> AgentConversation:
    """Called when an auto-DM is sent: the conversation waits for the answer of the prospect."""
    assert attempt.id is not None
    existing = session.exec(select(AgentConversation).where(AgentConversation.dm_attempt_id == attempt.id)).first()
    if existing is not None:
        return existing
    conversation = AgentConversation(
        account_id=attempt.account_id,
        dm_attempt_id=attempt.id,
        post_id=attempt.post_id,
        product_id=attempt.product_id,
        recipient_id=attempt.recipient_id,
        recipient_name=attempt.recipient_name,
        last_message_at=attempt.sent_at,
    )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


def link_outgoing(session: Session, platform_message_id: str, conversation_id: str) -> AgentConversation | None:
    """`message.sent` of the auto-DM: its platform message id gives the Zernio conversation id."""
    attempt = session.exec(select(DmAttempt).where(DmAttempt.zernio_message_id == platform_message_id)).first()
    if attempt is None:
        return None
    conversation = session.exec(
        select(AgentConversation).where(AgentConversation.dm_attempt_id == attempt.id)
    ).first()
    if conversation is not None and conversation.conversation_id is None:
        conversation.conversation_id = conversation_id
        session.add(conversation)
    return conversation


def link_incoming(session: Session, message: Message) -> AgentConversation | None:
    """`message.received`: find the conversation by its id, else by the sender (recipient of the auto-DM)."""
    if message.conversation_id:
        found = session.exec(
            select(AgentConversation).where(
                AgentConversation.account_id == message.account_id,
                AgentConversation.conversation_id == message.conversation_id,
            )
        ).first()
        if found is not None:
            return found
    since = utc_now() - LINK_WINDOW
    candidates = session.exec(
        select(AgentConversation)
        .where(
            AgentConversation.account_id == message.account_id,
            col(AgentConversation.conversation_id).is_(None),
            col(AgentConversation.created_at) >= since,
        )
        .order_by(col(AgentConversation.created_at).desc())
    )
    for conversation in candidates:
        same_id = message.author_id and conversation.recipient_id == message.author_id
        same_name = message.author_name and conversation.recipient_name == message.author_name
        if same_id or same_name:
            conversation.conversation_id = message.conversation_id
            session.add(conversation)
            return conversation
    return None


# Agent


def _set_status(conversation: AgentConversation, status: ConversationStatus, reason: str | None) -> None:
    conversation.status = status
    conversation.handoff_reason = reason
    conversation.updated_at = utc_now()


def _thread(session: Session, conversation: AgentConversation) -> list[Message]:
    if not conversation.conversation_id:
        return []
    query = (
        select(Message)
        .where(
            Message.account_id == conversation.account_id,
            Message.kind == MessageKind.dm,
            Message.conversation_id == conversation.conversation_id,
        )
        .order_by(col(Message.created_time), col(Message.id))
    )
    return list(session.exec(query))


def _agent_product(session: Session, product: Product, message: Message | None, post: Post) -> AgentProduct:
    """The link: the tracked link of the auto-DM for its product, else the product page with UTM."""
    attempt_link = None
    if message is not None:
        attempt_link = session.exec(
            select(TrackedLink).where(TrackedLink.message_id == message.id)
        ).first()
    if attempt_link is not None and attempt_link.product_id == product.id:
        link = tracking.dm_url(attempt_link)
    else:
        link = tracking.with_utm(product.landing_url, source=post.platform, content=f"post_{post.external_id}", term="dm")
    return AgentProduct(
        title=product.title, description=product.description, link=link, business_type=product.business_type
    )


def _build_input(session: Session, conversation: AgentConversation) -> AgentInput:
    attempt = session.get(DmAttempt, conversation.dm_attempt_id)
    origin = session.get(Message, attempt.message_id) if attempt else None
    post = session.get(Post, conversation.post_id)
    assert post is not None
    catalog = active_catalog(session, conversation.account_id)
    main = next((p for p in catalog if p.id == conversation.product_id), None)
    history = [
        AgentTurn(role="prospect" if m.direction == MessageDirection.incoming else "brand", text=m.text)
        for m in _thread(session, conversation)
        if m.text
    ]
    if attempt is not None and attempt.text and not any(t.role == "brand" for t in history):
        history.insert(0, AgentTurn(role="brand", text=attempt.text))  # The auto-DM is not received back yet.
    return AgentInput(
        origin_comment=origin.text if origin else "",
        post_caption=post.caption,
        product=_agent_product(session, main, origin, post) if main else None,
        other_products=[_agent_product(session, p, None, post) for p in catalog if p.id != conversation.product_id],
        history=history,
    )


def _guardrail(session: Session, conversation: AgentConversation, message: Message) -> tuple[str, str] | None:
    """A rule that stops the agent before the LLM: (status, reason)."""
    if _STOP.search(message.text):
        return ConversationStatus.closed.value, "The prospect asked to stop."
    if _HUMAN.search(message.text):
        return ConversationStatus.handed_off.value, "The prospect asked for a human."
    row = session.get(MessageClassification, message.id)
    if row is not None and row.intent == Intent.support_complaint:
        return ConversationStatus.handed_off.value, "Complaint or support request."
    if row is not None and row.sentiment == Sentiment.negative and row.intent != Intent.objection:
        return ConversationStatus.handed_off.value, "Negative message."
    if conversation.agent_replies >= get_settings().agent_max_replies:
        return ConversationStatus.handed_off.value, "Limit of automatic replies reached."
    return None


async def answer(
    session: Session, conversation: AgentConversation, message: Message, agent: ConversationAgent, zernio: ZernioClient
) -> AgentConversation:
    conversation.last_message_at = message.created_time or utc_now()
    if conversation.status not in AGENT_STATUSES:
        session.add(conversation)
        session.commit()
        return conversation
    stop = _guardrail(session, conversation, message)
    if stop is not None:
        _set_status(conversation, ConversationStatus(stop[0]), stop[1])
    else:
        decision = await agent.decide(_build_input(session, conversation))
        if decision.action == "close":
            _set_status(conversation, ConversationStatus.closed, decision.reason or "Conversation finished.")
        elif decision.action != "reply" or not conversation.conversation_id:
            reason = decision.reason or "The agent hands off."
            if not conversation.conversation_id:
                reason = "Zernio conversation id unknown."
            _set_status(conversation, ConversationStatus.handed_off, reason)
        else:
            await _send(session, conversation, decision.message.strip(), zernio)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


async def _send(session: Session, conversation: AgentConversation, text: str, zernio: ZernioClient) -> None:
    assert conversation.conversation_id is not None
    try:
        sent = await zernio.send_message(
            conversation.conversation_id, conversation.account_id, text, idempotency_key=str(uuid.uuid4())
        )
    except ZernioError as exc:
        _set_status(conversation, ConversationStatus.handed_off, f"Send failed: Zernio {exc.status_code}.")
        logger.warning("Agent send failed for conversation %s: %s", conversation.id, exc.message)
        return
    external_id = sent.message_id or f"agent-{uuid.uuid4().hex}"
    repository.upsert_message(
        session,
        account_id=conversation.account_id,
        kind=MessageKind.dm,
        external_id=external_id,
        text=text,
        conversation_id=conversation.conversation_id,
        author_is_owner=True,
        direction=MessageDirection.outgoing,
        created_time=utc_now(),
    )
    conversation.agent_message_ids = [*conversation.agent_message_ids, external_id]
    conversation.agent_replies += 1
    conversation.last_message_at = utc_now()
    _set_status(conversation, ConversationStatus.active, None)


async def reply_in_background(
    engine: Engine, agent: ConversationAgent, zernio_factory: ZernioClientFactory, message_ids: Sequence[int]
) -> None:
    """Background task after the classification of new DMs (webhook path)."""
    if not message_ids:
        return
    with Session(engine) as session:
        query = select(Message).where(
            col(Message.id).in_(message_ids),
            Message.kind == MessageKind.dm,
            Message.direction == MessageDirection.incoming,
        )
        messages = list(session.exec(query))
        if not messages:
            return
        async with zernio_factory() as zernio:
            for message in messages:
                conversation = link_incoming(session, message)
                if conversation is not None:
                    await answer(session, conversation, message, agent, zernio)


# Views for the user


def _get(session: Session, conversation_id: int) -> AgentConversation:
    conversation = session.get(AgentConversation, conversation_id)
    if conversation is None:
        raise ConversationError(404, "Conversation not found.")
    return conversation


def to_summary(session: Session, conversation: AgentConversation) -> ConversationSummary:
    item = ConversationSummary.model_validate(conversation)
    product = session.get(Product, conversation.product_id) if conversation.product_id is not None else None
    item.product_title = product.title if product else None
    thread = _thread(session, conversation)
    if thread:
        item.last_message = thread[-1].text
    else:
        attempt = session.get(DmAttempt, conversation.dm_attempt_id)
        item.last_message = attempt.text if attempt else None
    item.needs_attention = conversation.status == ConversationStatus.handed_off
    return item


def list_conversations(
    session: Session, account_id: str | None = None, status: ConversationStatus | None = None
) -> list[ConversationSummary]:
    query = select(AgentConversation)
    if account_id:
        query = query.where(AgentConversation.account_id == account_id)
    if status is not None:
        query = query.where(AgentConversation.status == status)
    rows = session.exec(query.order_by(col(AgentConversation.updated_at).desc(), col(AgentConversation.id).desc()))
    return [to_summary(session, c) for c in rows]


def detail(session: Session, conversation_id: int) -> ConversationDetail:
    conversation = _get(session, conversation_id)
    summary = to_summary(session, conversation)
    attempt = session.get(DmAttempt, conversation.dm_attempt_id)
    origin = session.get(Message, attempt.message_id) if attempt else None
    agent_ids = set(conversation.agent_message_ids)
    if attempt and attempt.zernio_message_id:
        agent_ids.add(attempt.zernio_message_id)
    thread = _thread(session, conversation)
    messages = [
        ThreadMessage(
            id=m.id,
            sent_by=SentBy.prospect
            if m.direction == MessageDirection.incoming
            else (SentBy.agent if m.external_id in agent_ids else SentBy.human),
            text=m.text,
            created_time=m.created_time,
        )
        for m in thread
    ]
    if attempt and attempt.text and not any(m.external_id == attempt.zernio_message_id for m in thread):
        messages.insert(0, ThreadMessage(id=None, sent_by=SentBy.agent, text=attempt.text, created_time=attempt.sent_at))
    return ConversationDetail(
        **summary.model_dump(), origin_comment=origin.text if origin else None, messages=messages
    )


def handoff(session: Session, conversation_id: int) -> ConversationSummary:
    conversation = _get(session, conversation_id)
    if conversation.status == ConversationStatus.closed:
        raise ConversationError(409, "The prospect asked to stop: the conversation is closed.")
    _set_status(conversation, ConversationStatus.handed_off, "The user took over.")
    session.add(conversation)
    session.commit()
    return to_summary(session, conversation)


def resume(session: Session, conversation_id: int) -> ConversationSummary:
    conversation = _get(session, conversation_id)
    if conversation.status == ConversationStatus.closed:
        raise ConversationError(409, "The prospect asked to stop: the agent cannot write again.")
    status = ConversationStatus.active if conversation.conversation_id else ConversationStatus.waiting_reply
    _set_status(conversation, status, None)
    conversation.agent_replies = 0  # The agent gets a new budget of automatic replies.
    session.add(conversation)
    session.commit()
    return to_summary(session, conversation)
