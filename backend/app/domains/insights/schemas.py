from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domains.insights.models import InsightCategory, PostFormat


class InsightsRunRequest(BaseModel):
    account_id: str
    post_id: int | None = Field(default=None, description="Only the messages of this post. Default: all the account.")
    product_id: int | None = Field(default=None, description="Only the messages about this product (F7 ter).")
    top: int = Field(default=5, ge=1, le=20, description="Number of themes returned per category.")


class InsightComment(BaseModel):
    id: int
    kind: str = Field(description="`comment` or `dm`.")
    text: str
    author_name: str | None
    post_id: int | None
    product_id: int | None
    created_time: datetime | None


class InsightThemeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: InsightCategory
    title: str
    summary: str = Field(description="One sentence that describes the insight.")
    mention_count: int = Field(description="Number of comments and DMs in the theme.")
    quotes: list[str] = Field(description="Short display: at most 3 real quotes, without usernames.")
    comments: list[InsightComment] = Field(default_factory=list, description="All the messages of the theme.")
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


class PostIdeasRequest(BaseModel):
    account_id: str
    product_id: int | None = Field(default=None, description="Optional: ideas that promote this product only.")


class PostIdeaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str = Field(description="Short name of the idea.")
    format: PostFormat
    hook: str = Field(description="First line (or first seconds of the reel) that stops the scroll.")
    outline: list[str] = Field(description="3 to 5 steps: slides of the carousel or scenes of the reel.")
    caption: str = Field(description="Draft caption, ready to edit.")
    call_to_action: str
    rationale: str = Field(description="Which insight the idea answers, with the number of mentions.")
    category: InsightCategory
    theme_ids: list[int] = Field(description="Insight themes (F12) that the idea uses.")
    product_id: int | None
    writer: str
    created_at: datetime


class PostIdeasResult(BaseModel):
    generation_id: str
    account_id: str
    insights_run_id: str
    ideas: list[PostIdeaRead] = Field(description="3 ideas, each one from a different insight.")
