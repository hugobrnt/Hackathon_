from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domains.conversations.models import ConversationSource, ConversationStatus


class SentBy(StrEnum):
    prospect = "prospect"
    agent = "agent"
    human = "human"


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: str
    source: ConversationSource = Field(description="`auto_dm` (after a comment) or `inbound_dm` (DM first).")
    post_id: int | None
    product_id: int | None
    product_title: str | None = None
    recipient_id: str | None
    recipient_name: str | None
    conversation_id: str | None
    status: ConversationStatus
    handoff_reason: str | None
    agent_replies: int
    last_message: str | None = None
    last_message_at: datetime | None
    needs_attention: bool = Field(default=False, description="True if a human must take over.")
    created_at: datetime


class ThreadMessage(BaseModel):
    id: int | None = Field(description="Message id in the database. None for the DM not received back yet.")
    sent_by: SentBy
    text: str
    created_time: datetime | None


class ConversationDetail(ConversationSummary):
    origin_comment: str | None = Field(
        description="The comment (auto_dm) or the first DM of the prospect (inbound_dm) that started it."
    )
    messages: list[ThreadMessage] = Field(description="The DMs in time order: auto-DM, prospect, agent, human.")


class AgentDecision(BaseModel):
    action: str = Field(description="`reply`, `handoff` or `close`.")
    message: str = ""
    reason: str = ""
