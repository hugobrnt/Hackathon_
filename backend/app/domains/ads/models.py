from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now


class BoostGoal(StrEnum):
    engagement = "engagement"
    awareness = "awareness"
    video_views = "video_views"


class BudgetType(StrEnum):
    daily = "daily"
    lifetime = "lifetime"


class BoostStatus(StrEnum):
    requested = "requested"  # Saved, the Zernio call is in progress.
    created = "created"  # Zernio created the campaign (often in review at the platform).
    failed = "failed"
    demo = "demo"  # Demo account: no real campaign.


class AdBoost(SQLModel, table=True):
    """A boost of a post as an ad (F9)."""

    __tablename__ = "ad_boosts"

    id: int | None = Field(default=None, primary_key=True)
    account_id: str = Field(index=True)
    post_id: int = Field(foreign_key="posts.id", index=True)
    ad_account_id: str
    name: str
    goal: BoostGoal
    budget_amount: float
    budget_type: BudgetType
    duration_days: int
    total_budget: float
    currency: str | None = None
    start_paused: bool
    status: BoostStatus = Field(index=True)
    idempotency_key: str = Field(unique=True)
    zernio_ad_id: str | None = None
    campaign_id: str | None = None
    ad_status: str | None = Field(default=None, description="Delivery status from Zernio.")
    review_status: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

