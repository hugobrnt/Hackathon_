"""Payloads of the Zernio webhooks (https://docs.zernio.com/webhooks/inbox) and API schemas."""

from datetime import datetime
from enum import StrEnum

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class PayloadModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class WebhookEnvelope(PayloadModel):
    """Fields common to all the Zernio events."""

    id: str = Field(description="Event id. It is the same on each retry.")
    event: str = Field(description="Event name, for example `comment.received`.")
    timestamp: datetime | None = None
    test: bool = False


class WebhookAccount(PayloadModel):
    account_id: str = Field(validation_alias=AliasChoices("accountId", "id"))
    platform: str | None = None
    username: str | None = None


class CommentAuthor(PayloadModel):
    id: str | None = None
    username: str | None = None
    name: str | None = None
    is_own_account: bool = Field(
        default=False, validation_alias=AliasChoices("isOwnAccount", "is_own_account")
    )


class WebhookComment(PayloadModel):
    id: str
    platform_post_id: str = Field(validation_alias=AliasChoices("platformPostId", "platform_post_id"))
    platform: str | None = None
    text: str | None = None
    author: CommentAuthor | None = None
    created_at: datetime | None = Field(default=None, validation_alias=AliasChoices("createdAt", "created_at"))
    parent_comment_id: str | None = Field(
        default=None, validation_alias=AliasChoices("parentCommentId", "parent_comment_id")
    )


class WebhookPost(PayloadModel):
    platform_post_id: str | None = Field(
        default=None, validation_alias=AliasChoices("platformPostId", "platform_post_id")
    )
    content: str | None = None
    image_url: str | None = Field(default=None, validation_alias=AliasChoices("imageUrl", "image_url"))
    permalink: str | None = None


class CommentReceivedEvent(WebhookEnvelope):
    comment: WebhookComment
    post: WebhookPost | None = None
    account: WebhookAccount


class MessageSender(PayloadModel):
    id: str | None = None
    name: str | None = None
    username: str | None = None


class WebhookMessage(PayloadModel):
    id: str
    platform_message_id: str | None = Field(
        default=None, validation_alias=AliasChoices("platformMessageId", "platform_message_id")
    )
    conversation_id: str = Field(validation_alias=AliasChoices("conversationId", "conversation_id"))
    platform: str | None = None
    direction: str = "incoming"
    text: str | None = None
    sender: MessageSender | None = None
    sent_at: datetime | None = Field(default=None, validation_alias=AliasChoices("sentAt", "sent_at"))


class MessageEvent(WebhookEnvelope):
    """`message.received` and `message.sent`."""

    message: WebhookMessage
    account: WebhookAccount
    metadata: dict[str, object] | None = None


class AckStatus(StrEnum):
    processed = "processed"
    duplicate = "duplicate"
    ignored = "ignored"


class WebhookAck(BaseModel):
    status: AckStatus
    event: str
    message_ids: list[int] = Field(
        default_factory=list, description="Ids of the stored messages that are new."
    )


class RegisterWebhookRequest(BaseModel):
    public_url: str | None = Field(
        default=None,
        description=(
            "Public base URL of this API (for example a cloudflared tunnel). "
            "Default: `PUBLIC_BASE_URL`."
        ),
        examples=["https://abc-def.trycloudflare.com"],
    )


class WebhookRegistration(BaseModel):
    webhook_id: str
    url: str
    events: list[str]
    created: bool = Field(description="True if the webhook is new, False if it was updated.")


class WebhookTestResult(BaseModel):
    webhook_id: str
    sent: bool
