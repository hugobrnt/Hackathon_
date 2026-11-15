from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.ads import service
from app.domains.ads.schemas import AdAccountRead, AdBoostRead, BoostRequest
from app.integrations.zernio.client import ZernioClient, get_zernio_client

router = APIRouter(tags=["ads"])

SessionDep = Annotated[Session, Depends(get_session)]
ZernioDep = Annotated[ZernioClient, Depends(get_zernio_client)]


def _errors(*codes: int) -> dict[int | str, dict[str, Any]]:
    return {code: {"model": ErrorResponse} for code in codes}


def _raise(exc: service.AdsError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get(
    "/ads/accounts",
    response_model=list[AdAccountRead],
    summary="List the ad accounts of a connected account",
    description="The ad accounts that the boost can use. Instagram needs a linked Facebook Page and a Meta ad account.",
    responses=_errors(401, 403, 404, 422, 502),
)
async def list_ad_accounts(account_id: str, zernio: ZernioDep) -> list[AdAccountRead]:
    try:
        return await service.list_ad_accounts(zernio, account_id)
    except service.AdsError as exc:
        raise _raise(exc) from exc


@router.post(
    "/posts/{post_id}/boost",
    response_model=AdBoostRead,
    status_code=201,
    summary="Boost a post (« Booster » button)",
    description=(
        "Creates a Zernio campaign that boosts the post (`POST /v1/ads/boost`). Guardrails: `confirm` must be true, "
        "the total budget is capped by `ADS_MAX_TOTAL_BUDGET`, and the campaign starts in pause by default. "
        "A campaign in review (`pending_review`) is a success. The demo account gets a simulated campaign."
    ),
    responses=_errors(400, 401, 403, 404, 409, 422, 429, 502),
)
async def boost_post(post_id: int, payload: BoostRequest, session: SessionDep, zernio: ZernioDep) -> AdBoostRead:
    try:
        return service.to_read(await service.boost_post(session, zernio, post_id, payload))
    except service.AdsError as exc:
        raise _raise(exc) from exc


@router.get(
    "/posts/{post_id}/boosts",
    response_model=list[AdBoostRead],
    summary="List the boosts of a post",
)
def list_post_boosts(post_id: int, session: SessionDep) -> list[AdBoostRead]:
    return [service.to_read(b) for b in service.list_boosts(session, post_id=post_id)]


@router.get(
    "/ads/boosts",
    response_model=list[AdBoostRead],
    summary="List the boosts",
)
def list_boosts(session: SessionDep, account_id: str | None = None) -> list[AdBoostRead]:
    return [service.to_read(b) for b in service.list_boosts(session, account_id=account_id)]


@router.post(
    "/ads/boosts/{boost_id}/refresh",
    response_model=AdBoostRead,
    summary="Refresh the status of a boost",
    description="Reads the delivery and review status of the ad from Zernio.",
    responses=_errors(404, 502),
)
async def refresh_boost(boost_id: int, session: SessionDep, zernio: ZernioDep) -> AdBoostRead:
    try:
        return service.to_read(await service.refresh(session, zernio, boost_id))
    except service.AdsError as exc:
        raise _raise(exc) from exc

