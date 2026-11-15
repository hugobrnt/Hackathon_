"""Async HTTP client for the Zernio API (https://docs.zernio.com)."""

from collections.abc import AsyncIterator, Callable, Mapping
from types import TracebackType
from typing import Self

import httpx

from app.core.config import Settings, get_settings
from app.integrations.zernio.schemas import (
    Account,
    AccountPostsResponse,
    AccountsResponse,
    Comment,
    ConnectUrl,
    Conversation,
    ConversationsResponse,
    DirectMessage,
    MessagesResponse,
    PlatformPost,
    PostAnalyticsResponse,
    AdAccount,
    AdAccountsResponse,
    BoostResponse,
    PostMetrics,
    ZernioAd,
    CommentReplyResponse,
    PrivateReplyResult,
    SendMessageResponse,
    SentMessage,
    PostCommentsResponse,
    Profile,
    ProfilesResponse,
    WebhookSettings,
    WebhookSettingsList,
    WebhookSettingsResponse,
)

# Safety limit: stop a cursor loop after this number of pages.
MAX_PAGES = 20

# Note: Zernio caches the inbox responses for up to 10 minutes, per set of query
# parameters. A comment posted after the first call can stay hidden during this
# period. The `comment.received` webhook (F2) gives the new comments in real time.


class ZernioError(Exception):
    """An error response from Zernio, or a network failure."""

    def __init__(
        self, status_code: int, message: str, code: str | None = None, details: dict[str, object] | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details or {}


class ZernioClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._settings = settings or get_settings()
        self._http = httpx.AsyncClient(
            base_url=self._settings.zernio_base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {self._settings.zernio_api_key}"},
            timeout=self._settings.zernio_timeout_seconds,
            transport=transport,
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        params: Mapping[str, str | int | bool | None] | None = None,
        json: Mapping[str, object] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> object:
        clean = {k: v for k, v in (params or {}).items() if v is not None}
        try:
            response = await self._http.request(method, path, params=clean, json=json, headers=headers)
        except httpx.HTTPError as exc:
            raise ZernioError(502, f"Zernio is unreachable: {exc}") from exc
        if response.is_error:
            message = response.text
            code: str | None = None
            details: dict[str, object] = {}
            try:
                body = response.json()
                if isinstance(body, dict):
                    message = str(body.get("error") or body.get("message") or message)
                    code = str(body["code"]) if body.get("code") is not None else None
                    details = self._error_details(body)
            except ValueError:
                pass
            raise ZernioError(response.status_code, message, code, details)
        result: object = response.json()
        return result

    @staticmethod
    def _error_details(body: object) -> dict[str, object]:
        if isinstance(body, dict) and isinstance(body.get("details"), dict):
            return dict(body["details"])
        return {}

    async def _get(self, path: str, params: Mapping[str, str | int | bool | None] | None = None) -> object:
        return await self._request("GET", path, params=params)

    # Connect and accounts

    async def get_connect_url(
        self, platform: str, profile_id: str, redirect_url: str, reconnect_account_id: str | None = None, login_method: str | None = None
    ) -> ConnectUrl:
        data = await self._get(
            f"/connect/{platform}",
            {
                "profileId": profile_id,
                "redirect_url": redirect_url,
                "reconnectAccountId": reconnect_account_id,
                "loginMethod": login_method,
                "welcome": "true",
                "brandName": "Signal",
            },
        )
        return ConnectUrl.model_validate(data)

    async def list_profiles(self) -> list[Profile]:
        return ProfilesResponse.model_validate(await self._get("/profiles")).profiles

    async def list_accounts(self, platform: str | None = None) -> list[Account]:
        data = await self._get("/accounts", {"platform": platform})
        return AccountsResponse.model_validate(data).accounts

    # Content

    async def list_account_posts(self, account_id: str) -> list[PlatformPost]:
        data = await self._get(f"/accounts/{account_id}/posts")
        return AccountPostsResponse.model_validate(data).posts

    async def send_private_reply(
        self, platform_post_id: str, comment_id: str, account_id: str, message: str
    ) -> PrivateReplyResult:
        """Send a DM to the author of a comment (Instagram/Facebook). One per comment, within 7 days."""
        data = await self._request(
            "POST",
            f"/inbox/comments/{platform_post_id}/{comment_id}/private-reply",
            json={"accountId": account_id, "message": message},
        )
        return PrivateReplyResult.model_validate(data)

    # Ads

    async def list_ad_accounts(self, account_id: str) -> list[AdAccount]:
        data = await self._get("/ads/accounts", {"accountId": account_id, "inScopeOnly": True})
        return AdAccountsResponse.model_validate(data).accounts

    async def boost_post(self, payload: Mapping[str, object], idempotency_key: str) -> ZernioAd:
        """Boost a published post as an ad. The key makes a retry return the first result."""
        data = await self._request("POST", "/ads/boost", json=payload, headers={"Idempotency-Key": idempotency_key})
        return BoostResponse.model_validate(data).ad

    async def get_ad(self, ad_id: str) -> ZernioAd:
        data = await self._get(f"/ads/{ad_id}")
        if isinstance(data, dict) and isinstance(data.get("ad"), dict):
            data = data["ad"]
        return ZernioAd.model_validate(data)

    async def send_message(
        self, conversation_id: str, account_id: str, message: str, idempotency_key: str
    ) -> SentMessage:
        """Send a DM in an existing conversation (F13). The key makes a retry return the first result."""
        data = await self._request(
            "POST",
            f"/inbox/conversations/{conversation_id}/messages",
            json={"accountId": account_id, "message": message},
            headers={"Idempotency-Key": idempotency_key},
        )
        return SendMessageResponse.model_validate(data).data

    async def reply_to_comment(
        self, platform_post_id: str, comment_id: str, account_id: str, message: str, idempotency_key: str
    ) -> str | None:
        """Public reply under a comment (F16). Returns the id of the new comment."""
        data = await self._request(
            "POST",
            f"/inbox/comments/{platform_post_id}",
            json={"accountId": account_id, "message": message, "commentId": comment_id},
            headers={"Idempotency-Key": idempotency_key},
        )
        return CommentReplyResponse.model_validate(data).data.comment_id

    async def sync_external_posts(self, account_id: str) -> None:
        """Ask Zernio to read the recent posts and their metrics from the platform now."""
        await self._request("POST", "/posts/sync-external", json={"accountId": account_id})

    async def get_post_metrics(self, platform_post_id: str, account_id: str) -> PostMetrics | None:
        """Views, likes, comments, shares, reposts of one post. None if Zernio has no data yet."""
        try:
            data = await self._get("/analytics", {"postId": platform_post_id, "accountId": account_id})
        except ZernioError as exc:
            if exc.status_code in (202, 404, 424):
                return None
            raise
        response = PostAnalyticsResponse.model_validate(data)
        if response.sync_status == "pending":
            return None
        return response.metrics_for(platform_post_id, account_id)

    async def iter_post_comments(self, post_id: str, account_id: str) -> AsyncIterator[Comment]:
        cursor: str | None = None
        for _ in range(MAX_PAGES):
            data = await self._get(
                f"/inbox/comments/{post_id}",
                {"accountId": account_id, "limit": 100, "cursor": cursor},
            )
            page = PostCommentsResponse.model_validate(data)
            for comment in page.comments:
                yield comment
            cursor = page.pagination.cursor
            if not page.pagination.has_more or not cursor:
                return

    async def iter_conversations(self, account_id: str) -> AsyncIterator[Conversation]:
        cursor: str | None = None
        for _ in range(MAX_PAGES):
            data = await self._get(
                "/inbox/conversations", {"accountId": account_id, "limit": 100, "cursor": cursor}
            )
            page = ConversationsResponse.model_validate(data)
            for conversation in page.data:
                yield conversation
            cursor = page.pagination.next_cursor
            if not page.pagination.has_more or not cursor:
                return

    async def iter_conversation_messages(
        self, conversation_id: str, account_id: str
    ) -> AsyncIterator[DirectMessage]:
        cursor: str | None = None
        for _ in range(MAX_PAGES):
            data = await self._get(
                f"/inbox/conversations/{conversation_id}/messages",
                {"accountId": account_id, "limit": 100, "cursor": cursor},
            )
            page = MessagesResponse.model_validate(data)
            for message in page.messages:
                yield message
            cursor = page.pagination.next_cursor
            if not page.pagination.has_more or not cursor:
                return


    # Webhooks

    async def list_webhooks(self) -> list[WebhookSettings]:
        return WebhookSettingsList.model_validate(await self._get("/webhooks/settings")).webhooks

    async def create_webhook(
        self, name: str, url: str, events: list[str], secret: str
    ) -> WebhookSettings:
        data = await self._request(
            "POST",
            "/webhooks/settings",
            json={"name": name, "url": url, "events": events, "secret": secret, "isActive": True},
        )
        return WebhookSettingsResponse.model_validate(data).webhook

    async def update_webhook(
        self, webhook_id: str, name: str, url: str, events: list[str], secret: str
    ) -> WebhookSettings:
        data = await self._request(
            "PUT",
            "/webhooks/settings",
            json={
                "webhookId": webhook_id,
                "name": name,
                "url": url,
                "events": events,
                "secret": secret,
                "isActive": True,
            },
        )
        return WebhookSettingsResponse.model_validate(data).webhook

    async def send_test_webhook(self, webhook_id: str) -> None:
        await self._request("POST", "/webhooks/test", json={"webhookId": webhook_id})


ZernioClientFactory = Callable[[], ZernioClient]


def get_zernio_client_factory() -> ZernioClientFactory:
    """FastAPI dependency for background tasks: they need their own client, opened after the response."""
    return lambda: ZernioClient(get_settings())


async def get_zernio_client() -> AsyncIterator[ZernioClient]:
    """FastAPI dependency. Tests override it with a mocked transport."""
    async with ZernioClient() as client:
        yield client
