from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domains.ads.models import BoostGoal, BoostStatus, BudgetType


class AdAccountRead(BaseModel):
    id: str = Field(description="Platform ad account id, for example `act_123` on Meta.")
    name: str | None
    currency: str | None
    account_status: int | str | None


class BoostRequest(BaseModel):
    ad_account_id: str = Field(description="From GET /ads/accounts.", examples=["act_123456789"])
    budget_amount: float = Field(gt=0, description="Amount per day (`daily`) or for the whole boost (`lifetime`).")
    budget_type: BudgetType = BudgetType.daily
    duration_days: int = Field(default=3, ge=1, le=30)
    goal: BoostGoal = BoostGoal.engagement
    name: str | None = Field(default=None, max_length=100, description="Default: « Boost – <start of the caption> ».")
    start_paused: bool = Field(
        default=True,
        description="True: the campaign is created in pause (safe for a demo). False: delivery starts after the review.",
    )
    confirm: bool = Field(
        description="Must be true. PRD guardrail: no campaign without an explicit confirmation click.",
    )

    @property
    def total_budget(self) -> float:
        if self.budget_type == BudgetType.daily:
            return round(self.budget_amount * self.duration_days, 2)
        return round(self.budget_amount, 2)


class AdBoostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: str
    post_id: int
    ad_account_id: str
    name: str
    goal: BoostGoal
    budget_amount: float
    budget_type: BudgetType
    duration_days: int
    total_budget: float
    currency: str | None
    start_paused: bool
    status: BoostStatus
    zernio_ad_id: str | None
    campaign_id: str | None
    ad_status: str | None
    review_status: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    is_success: bool = Field(
        default=False,
        description="True if the campaign exists (also when it is in review: the PRD counts `pending_review` as a success).",
    )

