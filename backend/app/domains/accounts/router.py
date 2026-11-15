from typing import Annotated
import secrets
from datetime import UTC, timedelta
from app.domains.auth.models import ConnectState
from app.domains.auth.router import digest
from app.domains.accounts.models import utc_now
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import ZERNIO_ERROR_RESPONSES
from app.domains.accounts import service
from app.domains.accounts.schemas import (
    ConnectUrlResponse,
    SocialAccountRead,
    SupportedPlatform,
)
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
    session: SessionDep,
    reconnect_account_id: Annotated[
        str | None,
        Query(
            description="Zernio accountId to reconnect, for example after a `reconnect_required` error."
        ),
    ] = None,
) -> ConnectUrlResponse:
    profile_id = await service.resolve_profile_id(zernio, settings)
    nonce = secrets.token_urlsafe(32)
    session.add(
        ConnectState(
            token_hash=digest(nonce),
            profile_id=profile_id,
            expires_at=utc_now() + timedelta(minutes=20),
        )
    )
    session.commit()
    redirect_url = (
        f"{settings.public_base_url.rstrip('/')}/accounts/callback?signal_state={nonce}"
    )
    connect = await zernio.get_connect_url(
        platform.value, profile_id, redirect_url, reconnect_account_id
    )
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
    signal_state: str | None = None,
) -> RedirectResponse:
    frontend = settings.frontend_url.rstrip("/") + "/"
    pending = session.get(ConnectState, digest(signal_state)) if signal_state else None
    if pending is None or pending.expires_at.replace(tzinfo=UTC) <= utc_now():
        return RedirectResponse(
            f"{frontend}?error=expired_connection&error_message=Restart+the+channel+connection",
            status_code=307,
        )
    expected_profile = pending.profile_id
    session.delete(pending)
    session.commit()
    if error or not connected:
        params = {
            "error": error or "missing_platform",
            "platform": platform or connected or "",
        }
        if error_message:
            params["error_message"] = error_message
        return RedirectResponse(f"{frontend}?{urlencode(params)}", status_code=307)

    try:
        remote = await zernio.list_accounts(platform=connected)
        candidates = [
            a
            for a in remote
            if a.platform == connected
            and a.profile_id_str == expected_profile
            and (not account_id or a.id == account_id)
        ]
        if len(candidates) != 1:
            raise ZernioError(
                404,
                "The authorized account could not be verified. Refresh your accounts or reconnect.",
            )
        verified = candidates[0]
        account = service.upsert_account(
            session,
            verified.id,
            verified.platform,
            verified.username or verified.display_name,
            verified.profile_id_str,
        )
    except ZernioError as exc:
        query = urlencode(
            {"error": exc.code or "zernio_error", "error_message": exc.message}
        )
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
    sync: Annotated[
        bool, Query(description="Sync from Zernio before the response.")
    ] = True,
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
    accounts = await service.sync_accounts(
        session, zernio, platform.value if platform else None
    )
    return [SocialAccountRead.model_validate(a) for a in accounts]
