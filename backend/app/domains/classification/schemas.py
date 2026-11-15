from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domains.classification.taxonomy import Intent, Sentiment


class ClassificationInput(BaseModel):
    text: str
    kind: str = Field(description="`comment` or `dm`.")
    is_reply: bool = False
    post_caption: str | None = None


class ClassificationOutput(BaseModel):
    intent: Intent
    sentiment: Sentiment
    confidence: float = Field(ge=0, le=1)
    rationale: str = ""
    model: str = Field(default="", description="Model that gave the result, or `heuristic` / `human`.")
    escalated: bool = Field(default=False, description="True if the large model was used.")
    fallback: bool = Field(default=False, description="True if the heuristic replaced the LLM after an error.")


class ClassificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    intent: Intent
    sentiment: Sentiment
    confidence: float
    rationale: str
    model: str
    needs_review: bool
    classified_at: datetime


class ClassificationRunRequest(BaseModel):
    account_id: str | None = Field(default=None, description="Only the messages of this account.")
    post_id: int | None = Field(default=None, description="Only the comments of this post.")
    force: bool = Field(default=False, description="Classify again the messages that have a result.")
    limit: int = Field(default=200, ge=1, le=2000)


class ClassificationRunResult(BaseModel):
    classified: int = 0
    escalated: int = 0
    fallback: int = 0
    failed: int = 0
    by_intent: dict[Intent, int] = Field(default_factory=dict)


class ManualClassification(BaseModel):
    intent: Intent
    sentiment: Sentiment
