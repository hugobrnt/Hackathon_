from datetime import datetime

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now


class TrackedLink(SQLModel, table=True):
    """A short link in an auto-DM (F8). One link per comment, so each click maps to one prospect."""

    __tablename__ = "tracked_links"

    code: str = Field(primary_key=True)
    account_id: str = Field(index=True)
    post_id: int = Field(foreign_key="posts.id", index=True)
    message_id: int = Field(foreign_key="messages.id", unique=True)
    recipient_id: str | None = None
    intent: str | None = None
    product_id: int | None = Field(default=None, index=True)
    destination_url: str = Field(description="Landing URL with the UTM parameters.")
    click_count: int = Field(default=0, description="Human clicks (link-preview bots excluded).")
    bot_hits: int = 0
    first_clicked_at: datetime | None = None
    last_clicked_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)


class LinkClick(SQLModel, table=True):
    """One hit on a tracked link. GDPR: no IP address and no user agent are stored."""

    __tablename__ = "link_clicks"

    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(foreign_key="tracked_links.code", index=True)
    is_bot: bool = False
    clicked_at: datetime = Field(default_factory=utc_now)
