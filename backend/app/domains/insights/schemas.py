from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domains.insights.models import InsightCategory


class InsightsRunRequest(BaseModel):
    account_id: str
    post_id: int | None = Field(default=None, description="Only the messages of this post. Default: all the account.")
    top: int = Field(default=5, ge=1, le=20, description="Number of themes returned per category.")


class InsightThemeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: InsightCategory
    title: str
    summary: str
    mention_count: int = Field(description="Number of comments and DMs in the theme.")
    quotes: list[str] = Field(description="Real quotes of the audience, without usernames (at most 3).")
    message_ids: list[int]
    post_ids: list[int]


class CategoryInsights(BaseModel):
    category: InsightCategory
    total_messages: int = Field(description="Classified messages of this category.")
    themes: list[InsightThemeRead] = Field(description="Most frequent themes first.")


class InsightsReport(BaseModel):
    run_id: str
    account_id: str
    post_id: int | None
    writer: str = Field(description="Model that grouped the messages, or `heuristic`.")
    generated_at: datetime
    categories: list[CategoryInsights]
