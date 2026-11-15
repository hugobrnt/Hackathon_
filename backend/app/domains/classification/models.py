from datetime import datetime

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now
from app.domains.classification.taxonomy import Intent, Sentiment


class MessageClassification(SQLModel, table=True):
    """The classification of one message (one row per message)."""

    __tablename__ = "message_classifications"

    message_id: int = Field(foreign_key="messages.id", primary_key=True)
    intent: Intent = Field(index=True)
    sentiment: Sentiment
    confidence: float
    rationale: str = ""
    model: str
    needs_review: bool = Field(default=False, description="A human must validate it before an automatic action.")
    classified_at: datetime = Field(default_factory=utc_now)
