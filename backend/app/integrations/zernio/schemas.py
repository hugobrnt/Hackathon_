"""Pydantic models for the Zernio API responses that the backend uses.

The models ignore unknown fields and make most fields optional, because Zernio
omits absent fields and the payload changes by platform.
"""

from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class ZernioModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ConnectUrl(ZernioModel):
    auth_url: str = Field(validation_alias=AliasChoices("authUrl", "auth_url"))
    state: str | None = None


class Profile(ZernioModel):
    id: str = Field(validation_alias=AliasChoices("_id", "id"))
    name: str | None = None


class ProfilesResponse(ZernioModel):
    profiles: list[Profile] = []


class Account(ZernioModel):
    id: str = Field(validation_alias=AliasChoices("_id", "id", "accountId"))
    platform: str
    username: str | None = None
    display_name: str | None = Field(
        default=None, validation_alias=AliasChoices("displayName", "display_name")
    )
    profile_id: str | dict[str, object] | None = Field(
        default=None, validation_alias=AliasChoices("profileId", "profile_id")
    )

    @property
    def profile_id_str(self) -> str | None:
        """`profileId` is an id string or a populated profile object."""
        if isinstance(self.profile_id, dict):
            value = self.profile_id.get("_id") or self.profile_id.get("id")
            return str(value) if value is not None else None
        return self.profile_id


class AccountsResponse(ZernioModel):
    accounts: list[Account] = []


class PlatformPost(ZernioModel):
    id: str
    platform: str | None = None
    message: str | None = None
    created_time: datetime | None = Field(
        default=None, validation_alias=AliasChoices("createdTime", "created_time")
    )
    permalink: str | None = None
    picture: str | None = None
    media_type: str | None = Field(
        default=None, validation_alias=AliasChoices("mediaType", "media_type")
    )
    comment_count: int = Field(
        default=0, validation_alias=AliasChoices("commentCount", "comment_count")
    )
    like_count: int = Field(
        default=0, validation_alias=AliasChoices("likeCount", "like_count")
    )
    share_count: int | None = Field(
        default=None, validation_alias=AliasChoices("shareCount", "share_count")
    )


class AccountPostsResponse(ZernioModel):
    posts: list[PlatformPost] = []


class CommentAuthor(ZernioModel):
    id: str | None = None
    name: str | None = None
    username: str | None = None
    is_owner: bool = Field(default=False, validation_alias=AliasChoices("isOwner", "is_owner"))


class Comment(ZernioModel):
    id: str
    message: str | None = None
    created_time: datetime | None = Field(
        default=None, validation_alias=AliasChoices("createdTime", "created_time")
    )
    from_: CommentAuthor | None = Field(default=None, validation_alias=AliasChoices("from", "from_"))
    parent_id: str | None = Field(default=None, validation_alias=AliasChoices("parentId", "parent_id"))
    replies: list["Comment"] = []


class CommentsPagination(ZernioModel):
    has_more: bool = Field(default=False, validation_alias=AliasChoices("hasMore", "has_more"))
    cursor: str | None = None


class PostCommentsResponse(ZernioModel):
    comments: list[Comment] = []
    pagination: CommentsPagination = CommentsPagination()


class CursorPagination(ZernioModel):
    has_more: bool = Field(default=False, validation_alias=AliasChoices("hasMore", "has_more"))
    next_cursor: str | None = Field(
        default=None, validation_alias=AliasChoices("nextCursor", "next_cursor")
    )


class Conversation(ZernioModel):
    id: str
    platform: str | None = None
    account_id: str | None = Field(default=None, validation_alias=AliasChoices("accountId", "account_id"))
    participant_name: str | None = Field(
        default=None, validation_alias=AliasChoices("participantName", "participant_name")
    )
    updated_time: datetime | None = Field(
        default=None, validation_alias=AliasChoices("updatedTime", "updated_time")
    )


class ConversationsResponse(ZernioModel):
    data: list[Conversation] = []
    pagination: CursorPagination = CursorPagination()


class DirectMessage(ZernioModel):
    id: str
    conversation_id: str | None = Field(
        default=None, validation_alias=AliasChoices("conversationId", "conversation_id")
    )
    message: str | None = None
    sender_id: str | None = Field(default=None, validation_alias=AliasChoices("senderId", "sender_id"))
    sender_name: str | None = Field(
        default=None, validation_alias=AliasChoices("senderName", "sender_name")
    )
    direction: str = "incoming"
    created_at: datetime | None = Field(
        default=None, validation_alias=AliasChoices("createdAt", "created_at")
    )


class MessagesResponse(ZernioModel):
    messages: list[DirectMessage] = []
    pagination: CursorPagination = CursorPagination()


class WebhookSettings(ZernioModel):
    id: str = Field(validation_alias=AliasChoices("_id", "id", "webhookId"))
    name: str | None = None
    url: str
    events: list[str] = []
    is_active: bool = Field(default=True, validation_alias=AliasChoices("isActive", "is_active"))


class WebhookSettingsList(ZernioModel):
    webhooks: list[WebhookSettings] = []


class WebhookSettingsResponse(ZernioModel):
    webhook: WebhookSettings


class PostMetrics(ZernioModel):
    views: int | None = None
    likes: int | None = None
    comments: int | None = None
    shares: int | None = None
    reposts: int | None = None
    saves: int | None = None
    impressions: int | None = None
    reach: int | None = None
    last_updated: datetime | None = Field(
        default=None, validation_alias=AliasChoices("lastUpdated", "last_updated")
    )


class PlatformAnalytics(ZernioModel):
    platform_post_id: str | None = Field(
        default=None, validation_alias=AliasChoices("platformPostId", "platform_post_id")
    )
    account_id: str | None = Field(default=None, validation_alias=AliasChoices("accountId", "account_id"))
    analytics: PostMetrics | None = None


class PostAnalyticsResponse(ZernioModel):
    analytics: PostMetrics | None = None
    platform_analytics: list[PlatformAnalytics] = Field(
        default=[], validation_alias=AliasChoices("platformAnalytics", "platform_analytics")
    )
    sync_status: str | None = Field(default=None, validation_alias=AliasChoices("syncStatus", "sync_status"))

    def metrics_for(self, platform_post_id: str, account_id: str) -> PostMetrics | None:
        for item in self.platform_analytics:
            if item.platform_post_id == platform_post_id and item.account_id in (None, account_id):
                return item.analytics
        return self.analytics


class PrivateReplyResult(ZernioModel):
    status: str | None = None
    message_id: str | None = Field(default=None, validation_alias=AliasChoices("messageId", "message_id"))
    comment_id: str | None = Field(default=None, validation_alias=AliasChoices("commentId", "comment_id"))
