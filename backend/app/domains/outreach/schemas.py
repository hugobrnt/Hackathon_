from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domains.classification.taxonomy import Intent
from app.domains.outreach.models import DmStatus, PublicReplyStatus
from app.domains.products.models import BusinessType


class AutoDmSettingsUpdate(BaseModel):
    enabled: bool
    product_id: int | None = Field(
        default=None,
        description="Optional: force this product of the catalog for all the DMs of this post. "
        "Default: the product found for each comment (F7 ter).",
    )
    require_approval: bool = Field(default=False, description="F17: all DMs wait for a human approval.")
    public_reply: bool = Field(
        default=True,
        description="F16: after each DM, reply in public under the comment (custom text, language of the comment).",
    )


class AutoDmSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    post_id: int
    enabled: bool
    product_id: int | None
    require_approval: bool
    public_reply: bool
    updated_at: datetime


class DmDraftInput(BaseModel):
    comment: str
    author_name: str | None
    intent: Intent
    post_caption: str
    landing_url: str
    business_type: BusinessType
    product_name: str
    product_description: str
    reply_tone: str = "friendly"
    reply_goal: str = "product_visit"


class DmDraft(BaseModel):
    product_id: int | None = None
    product_title: str | None = None
    text: str
    writer: str = Field(description="Model that wrote the text, or `template`.")
    tracked_link_code: str | None = None
    tracked_url: str | None = Field(
        default=None,
        description="URL written in the DM: the short tracked link, or the UTM landing URL if the API is not public.",
    )


class DmAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message_id: int
    account_id: str
    post_id: int
    recipient_id: str | None
    recipient_name: str | None
    intent: Intent
    status: DmStatus
    reason: str | None
    text: str
    writer: str
    zernio_message_id: str | None
    product_id: int | None = None
    product_title: str | None = None
    tracked_link_code: str | None = None
    tracked_url: str | None = Field(
        default=None,
        description="Short tracked link of this DM (F8). Each visit is counted as a click.",
    )
    public_reply_status: PublicReplyStatus | None = Field(default=None, description="F16: public reply under the comment.")
    public_reply_text: str | None = None
    public_reply_comment_id: str | None = None
    public_reply_reason: str | None = None
    link_clicks: int = Field(default=0, description="Human clicks on the link of this DM.")
    retryable: bool
    comment_time: datetime | None
    created_at: datetime
    sent_at: datetime | None
    latency_seconds: float | None = Field(
        default=None,
        description="Time between the comment and the DM (PRD target: < 60 s).",
    )


class ApproveRequest(BaseModel):
    text: str | None = Field(default=None, max_length=1000, description="Optional edited text of the DM.")
    product_id: int | None = Field(
        default=None,
        description="Optional product of the catalog. Without `text`, the DM is written again for this product.",
    )


class AutoDmRunResult(BaseModel):
    processed: int = 0
    sent: int = 0
    pending_approval: int = 0
    skipped: int = 0
    failed: int = 0
    attempts: list[DmAttemptRead] = []


class PublicReplyInput(BaseModel):
    comment: str
    author_username: str | None
    intent: Intent
    product_title: str | None
    post_caption: str


class PublicReplyPreview(BaseModel):
    text: str | None = Field(description="The public reply, or None if the LLM could not write it.")
    writer: str
