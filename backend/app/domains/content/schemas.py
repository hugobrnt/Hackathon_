from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domains.classification.schemas import ClassificationRead
from app.domains.content.models import MessageDirection, MessageKind


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: str
    account_id: str
    platform: str
    caption: str
    permalink: str | None
    picture: str | None
    media_type: str | None
    created_time: datetime | None
    comment_count: int = Field(description="Comments reported by the platform (owner replies included).")
    like_count: int
    view_count: int | None = Field(description="Views (Instagram insights). None if not available yet.")
    share_count: int | None = Field(description="Shares. None if not available yet.")
    repost_count: int | None = Field(description="Reposts. None if not available yet.")
    metrics_updated_at: datetime | None


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: str
    account_id: str
    kind: MessageKind
    post_id: int | None
    conversation_id: str | None
    parent_external_id: str | None
    author_id: str | None
    author_name: str | None
    author_is_owner: bool
    direction: MessageDirection
    text: str
    created_time: datetime | None
    classification: ClassificationRead | None = None
