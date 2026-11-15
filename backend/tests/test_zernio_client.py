import httpx
import pytest
import respx

from app.core.config import Settings
from app.integrations.zernio.client import ZernioClient, ZernioError


async def test_list_accounts_accepts_mongo_id(settings: Settings, zernio_mock: respx.MockRouter) -> None:
    route = zernio_mock.get("/accounts").respond(
        json={"accounts": [{"_id": "acc-1", "platform": "instagram", "username": "karim", "profileId": {"_id": "p1"}}]}
    )
    async with ZernioClient(settings) as client:
        accounts = await client.list_accounts(platform="instagram")
    assert route.calls.last.request.headers["Authorization"] == "Bearer test-key"
    assert route.calls.last.request.url.params["platform"] == "instagram"
    assert accounts[0].id == "acc-1"
    assert accounts[0].profile_id_str == "p1"


async def test_post_comments_follow_cursor(settings: Settings, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/inbox/comments/post-1", params={"cursor": "c2"}).respond(
        json={"comments": [{"id": "b"}], "pagination": {"hasMore": False}}
    )
    zernio_mock.get("/inbox/comments/post-1").respond(
        json={"comments": [{"id": "a"}], "pagination": {"hasMore": True, "cursor": "c2"}}
    )
    async with ZernioClient(settings) as client:
        ids = [c.id async for c in client.iter_post_comments("post-1", "acc-1")]
    assert ids == ["a", "b"]


async def test_error_response_raises_zernio_error(settings: Settings, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/accounts/acc-1/posts").respond(
        401, json={"error": "Invalid API key", "code": "invalid_credentials"}
    )
    async with ZernioClient(settings) as client:
        with pytest.raises(ZernioError) as info:
            await client.list_account_posts("acc-1")
    assert info.value.status_code == 401
    assert info.value.code == "invalid_credentials"


async def test_network_error_raises_502(settings: Settings, zernio_mock: respx.MockRouter) -> None:
    zernio_mock.get("/profiles").mock(side_effect=httpx.ConnectError("boom"))
    async with ZernioClient(settings) as client:
        with pytest.raises(ZernioError) as info:
            await client.list_profiles()
    assert info.value.status_code == 502
