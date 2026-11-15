from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now


class ConversationStatus(StrEnum):
    waiting_reply = "waiting_reply"  # The auto-DM is sent; the prospect did not answer yet.
    active = "active"  # The agent answers the prospect.
    handed_off = "handed_off"  # A human must take over (limit, complaint, request, user choice).
    closed = "closed"  # The prospect asked to stop: no more message.


AGENT_STATUSES = (ConversationStatus.waiting_reply, ConversationStatus.active)


class AgentConversation(SQLModel, table=True):
    """A DM conversation started by an auto-DM (F13)."""

    __tablename__ = "agent_conversations"

    id: int | None = Field(default=None, primary_key=True)
    account_id: str = Field(index=True)
    dm_attempt_id: int = Field(foreign_key="dm_attempts.id", unique=True)
    post_id: int = Field(foreign_key="posts.id", index=True)
    product_id: int | None = None
    recipient_id: str | None = Field(default=None, index=True)
    recipient_name: str | None = None
    conversation_id: str | None = Field(default=None, index=True, description="Zernio conversation id.")
    status: ConversationStatus = Field(default=ConversationStatus.waiting_reply, index=True)
    handoff_reason: str | None = None
    agent_replies: int = 0
    agent_message_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    last_message_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
