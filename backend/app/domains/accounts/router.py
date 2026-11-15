from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import ZERNIO_ERROR_RESPONSES
from app.domains.accounts import service
from app.domains.accounts.schemas import ConnectUrlResponse, SocialAccountRead, SupportedPlatform
from app.integrations.zernio.client import ZernioClient, ZernioError, get_zernio_client

router = APIRouter(prefix="/accounts", tags=["accounts"])

SessionDep = Annotated[Session, Depends(get_session)]
ZernioDep = Annotated[ZernioClient, Depends(get_zernio_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post(
    "/connect/{platform}",
    response_model=ConnectUrlResponse,
    summary="Start the Zernio OAuth flow",
    description=(
        "Returns the Zernio OAuth URL for the platform. After the user connects the account, "
        "Zernio redirects the browser to `GET /accounts/callback`."
    ),
    responses=ZERNIO_ERROR_RESPONSES,
)
async def start_connect(
    platform: SupportedPlatform,
    zernio: ZernioDep,
    settings: SettingsDep,
    reconnect_account_id: Annotated[
        str | None,
        Query(description="Zernio accountId to reconnect, for example after a `reconnect_required` error."),
    ] = None,
) -> ConnectUrlResponse:
    profile_id = await service.resolve_profile_id(zernio, settings)
    redirect_url = f"{settings.public_base_url.rstrip('/')}/accounts/callback"
    connect = await zernio.get_connect_url(platform.value, profile_id, redirect_url, reconnect_account_id)
    return ConnectUrlResponse(auth_url=connect.auth_url)


@router.get(
    "/callback",
    response_class=RedirectResponse,
    status_code=307,
    summary="OAuth callback from Zernio",
    description=(
        "Zernio calls this URL after the OAuth flow. The endpoint saves the connected account "
        "and redirects the browser to the frontend with `connected`/`account_id` or `error`."
    ),
)
async def connect_callback(
    session: SessionDep,
    zernio: ZernioDep,
    settings: SettingsDep,
    connected: Annotated[str | None, Query(description="Connected platform.")] = None,
    account_id: Annotated[str | None, Query(alias="accountId")] = None,
    profile_id: Annotated[str | None, Query(alias="profileId")] = None,
    username: str | None = None,
    error: str | None = None,
    platform: str | None = None,
    error_message: str | None = None,
) -> RedirectResponse:
    frontend = settings.frontend_url.rstrip("/") + "/"
    if error or not connected:
        params = {"error": error or "missing_platform", "platform": platform or connected or ""}
        if error_message:
            params["error_message"] = error_message
        return RedirectResponse(f"{frontend}?{urlencode(params)}", status_code=307)

    try:
        if account_id:
            account = service.upsert_account(session, account_id, connected, username, profile_id)
        else:
            synced = await service.sync_accounts(session, zernio, platform=connected)
            if not synced:
                raise ZernioError(404, "The connected account was not found in Zernio.")
            account = synced[-1]
    except ZernioError as exc:
        query = urlencode({"error": exc.code or "zernio_error", "error_message": exc.message})
        return RedirectResponse(f"{frontend}?{query}", status_code=307)

    query = urlencode({"connected": account.platform, "account_id": account.id})
    return RedirectResponse(f"{frontend}?{query}", status_code=307)


@router.get(
    "",
    response_model=list[SocialAccountRead],
    summary="List the connected accounts",
    description=(
        "Syncs the accounts connected in Zernio (also the ones connected in the Zernio dashboard), "
        "then returns the local accounts. If Zernio fails, returns the local accounts only."
    ),
)
async def get_accounts(
    session: SessionDep,
    zernio: ZernioDep,
    sync: Annotated[bool, Query(description="Sync from Zernio before the response.")] = True,
) -> list[SocialAccountRead]:
    if sync:
        try:
            await service.sync_accounts(session, zernio)
        except ZernioError:
            pass
    return [SocialAccountRead.model_validate(a) for a in service.list_accounts(session)]


@router.post(
    "/sync",
    response_model=list[SocialAccountRead],
    summary="Sync the accounts from Zernio",
    description="Copies the accounts already connected in Zernio into the local database.",
    responses=ZERNIO_ERROR_RESPONSES,
)
async def sync_accounts(
    session: SessionDep,
    zernio: ZernioDep,
    platform: Annotated[SupportedPlatform | None, Query()] = None,
) -> list[SocialAccountRead]:
    accounts = await service.sync_accounts(session, zernio, platform.value if platform else None)
    return [SocialAccountRead.model_validate(a) for a in accounts]
