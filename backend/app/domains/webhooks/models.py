from datetime import datetime

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now


class WebhookEvent(SQLModel, table=True):
    """A received Zernio webhook event. The primary key is the Zernio event id (dedupe key)."""

    __tablename__ = "webhook_events"

    id: str = Field(primary_key=True)
    event: str = Field(index=True)
    account_id: str | None = Field(default=None, index=True)
    status: str = "processed"
    error: str | None = None
    received_at: datetime = Field(default_factory=utc_now)
