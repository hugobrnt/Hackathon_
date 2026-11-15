from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now
from app.domains.classification.taxonomy import Intent


class PostAutoDm(SQLModel, table=True):
    """Auto-DM settings of one post. Without a row, the auto-DM is off."""

    __tablename__ = "post_auto_dm"

    post_id: int = Field(foreign_key="posts.id", primary_key=True)
    enabled: bool = False
    landing_url: str | None = Field(default=None, description="Deprecated (one-product version). Not used.")
    product_id: int | None = Field(default=None, description="Product forced for the DMs of this post (F7 ter).")
    require_approval: bool = Field(default=False, description="All the DMs of this post wait for a human approval.")
    updated_at: datetime = Field(default_factory=utc_now)


class DmStatus(StrEnum):
    pending_approval = "pending_approval"
    sending = "sending"
    sent = "sent"
    failed = "failed"
    skipped = "skipped"
    rejected = "rejected"


# The statuses that count for the rule "one DM per person and per post".
ACTIVE_STATUSES = (DmStatus.pending_approval, DmStatus.sending, DmStatus.sent)


class DmAttempt(SQLModel, table=True):
    """One auto-DM for one comment. The unique `message_id` is the idempotency key."""

    __tablename__ = "dm_attempts"

    id: int | None = Field(default=None, primary_key=True)
    message_id: int = Field(foreign_key="messages.id", unique=True)
    account_id: str = Field(index=True)
    post_id: int = Field(foreign_key="posts.id", index=True)
    recipient_id: str | None = Field(default=None, index=True)
    recipient_name: str | None = None
    intent: Intent
    status: DmStatus = Field(index=True)
    reason: str | None = Field(default=None, description="Why the DM was skipped, waits for approval, or failed.")
    text: str = ""
    writer: str = ""
    zernio_message_id: str | None = None
    product_id: int | None = Field(default=None, index=True, description="Product proposed in the DM (F7 ter).")
    tracked_link_code: str | None = Field(default=None, description="Short link in the DM (F8).")
    retryable: bool = False
    comment_time: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    sent_at: datetime | None = None
