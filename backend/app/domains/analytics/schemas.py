from enum import StrEnum

from pydantic import BaseModel, Field

from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content.schemas import MessageRead, PostRead


class PostSortKey(StrEnum):
    intent_score = "intent_score"
    purchase_intent_rate = "purchase_intent_rate"
    buying_signal_rate = "buying_signal_rate"
    comments = "comments"
    likes = "likes"
    views = "views"
    shares = "shares"
    recent = "recent"


class PostIntentStats(BaseModel):
    post: PostRead
    total_comments: int = Field(description="Incoming comments of the audience (the owner's replies are excluded).")
    classified_comments: int
    unclassified_comments: int
    intent_counts: dict[Intent, int] = Field(description="Number of classified comments for each intent.")
    sentiment_counts: dict[Sentiment, int]
    purchase_intent_rate: float = Field(
        description="`purchase_intent` comments ÷ total comments (PRD KPI). From 0 to 1."
    )
    buying_signal_rate: float = Field(
        description="(`purchase_intent` + `pre_purchase_question`) comments ÷ total comments. From 0 to 1."
    )
    intent_score: float = Field(
        description="(purchase × 3 + question × 2 + objection × 1) ÷ total comments (PRD formula). From 0 to 3."
    )
    needs_review: int = Field(description="Comments that a human must validate.")
    rank: int = Field(description="Position in the requested sort order, from 1.")


class PostDetail(PostIntentStats):
    """F6: the stats of one post, its key comments and all its comments."""

    key_comments: list[MessageRead] = Field(
        description="Up to 5 comments with the strongest business signal (purchase, question, objection, support)."
    )
    comments: list[MessageRead] = Field(description="All the comments of the post, oldest first, with their classification.")
