from datetime import datetime
from sqlmodel import Field, SQLModel
from app.domains.accounts.models import utc_now


class ReplySettings(SQLModel, table=True):
    __tablename__ = "reply_settings"
    account_id: str = Field(primary_key=True, foreign_key="social_accounts.id")
    tone: str = "professional"
    goal: str = "product_visit"
    escalation_topics: str = ""
    updated_at: datetime = Field(default_factory=utc_now)
