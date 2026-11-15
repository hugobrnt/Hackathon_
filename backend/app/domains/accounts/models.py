from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class SocialAccount(SQLModel, table=True):
    """A social account connected through Zernio. The primary key is the Zernio accountId."""

    __tablename__ = "social_accounts"

    id: str = Field(primary_key=True)
    platform: str = Field(index=True)
    username: str | None = None
    profile_id: str | None = None
    is_active: bool | None = None
    needs_reconnection: bool | None = None
    is_demo: bool = False
    connected_at: datetime = Field(default_factory=utc_now)
    last_imported_at: datetime | None = None
