from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now
from app.domains.classification.taxonomy import Intent


class InsightCategory(StrEnum):
    objections = "objections"
    feature_requests = "feature_requests"
    needs = "needs"  # Pre-purchase questions: what the audience needs to know before it buys.
    praise = "praise"  # Testimonials: marketing insight (social proof).


CATEGORY_INTENTS: dict[InsightCategory, Intent] = {
    InsightCategory.objections: Intent.objection,
    InsightCategory.feature_requests: Intent.feature_request,
    InsightCategory.needs: Intent.pre_purchase_question,
    InsightCategory.praise: Intent.testimonial,
}


class InsightTheme(SQLModel, table=True):
    """One theme of similar messages (F12). One run stores all the themes of an account."""

    __tablename__ = "insight_themes"

    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    account_id: str = Field(index=True)
    post_id: int | None = Field(default=None, index=True, description="Set if the run covers one post only.")
    category: InsightCategory = Field(index=True)
    title: str
    summary: str = ""
    mention_count: int
    quotes: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    message_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    post_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    writer: str
    generated_at: datetime = Field(default_factory=utc_now)
