from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TrackedLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    short_url: str = ""
    account_id: str
    post_id: int
    message_id: int
    recipient_id: str | None
    intent: str | None
    destination_url: str
    click_count: int
    bot_hits: int
    first_clicked_at: datetime | None
    last_clicked_at: datetime | None
    created_at: datetime


class PostClickStats(BaseModel):
    post_id: int
    dms_sent: int
    links_clicked: int = Field(description="Sent DMs whose link has at least one human click.")
    clicks: int = Field(description="All human clicks, repeated clicks included.")
    click_through_rate: float = Field(description="links_clicked ÷ dms_sent (PRD KPI « Taux de clic DM »).")


class TrackingStats(BaseModel):
    dms_sent: int
    links_clicked: int
    clicks: int
    click_through_rate: float
    posts: list[PostClickStats]
