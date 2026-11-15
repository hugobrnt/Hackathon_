from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel, UniqueConstraint


class MessageKind(StrEnum):
    comment = "comment"
    dm = "dm"


class MessageDirection(StrEnum):
    incoming = "incoming"
    outgoing = "outgoing"


class Post(SQLModel, table=True):
    __tablename__ = "posts"
    __table_args__ = (UniqueConstraint("account_id", "external_id"),)

    id: int | None = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, description="Platform post id.")
    account_id: str = Field(foreign_key="social_accounts.id", index=True)
    platform: str
    caption: str = ""
    permalink: str | None = None
    picture: str | None = None
    media_type: str | None = None
    created_time: datetime | None = None
    comment_count: int = 0
    like_count: int = 0
    # Platform metrics from the Zernio analytics. None = not available yet.
    view_count: int | None = None
    share_count: int | None = None
    repost_count: int | None = None
    metrics_updated_at: datetime | None = None


class Message(SQLModel, table=True):
    """A comment on a post or a direct message. F3 will add the classification fields."""

    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("account_id", "kind", "external_id"),)

    id: int | None = Field(default=None, primary_key=True)
    external_id: str = Field(index=True)
    account_id: str = Field(foreign_key="social_accounts.id", index=True)
    kind: MessageKind = Field(index=True)
    post_id: int | None = Field(default=None, foreign_key="posts.id", index=True)
    conversation_id: str | None = Field(default=None, index=True)
    parent_external_id: str | None = None
    author_id: str | None = None
    author_name: str | None = None
    author_is_owner: bool = False
    direction: MessageDirection = MessageDirection.incoming
    text: str = ""
    created_time: datetime | None = None
