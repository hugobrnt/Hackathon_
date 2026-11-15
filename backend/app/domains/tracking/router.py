from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.tracking import service
from app.domains.tracking.schemas import TrackedLinkRead, TrackingStats

router = APIRouter(tags=["tracking"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get(
    service.REDIRECT_PATH + "/{code}",
    response_class=RedirectResponse,
    status_code=302,
    summary="Follow a tracked link",
    description=(
        "Counts the click, then redirects to the landing page with the UTM parameters. "
        "Link-preview bots (Instagram, Messenger) are counted apart and are not clicks."
    ),
    responses={404: {"model": ErrorResponse, "description": "Unknown link."}},
)
def follow_link(
    code: str, session: SessionDep, user_agent: Annotated[str | None, Header()] = None
) -> RedirectResponse:
    link = service.register_hit(session, code, user_agent)
    if link is None:
        raise HTTPException(status_code=404, detail="Unknown link.")
    # 302 and no-store: each visit comes back to us, so each click is counted.
    return RedirectResponse(link.destination_url, status_code=302, headers={"Cache-Control": "no-store"})


@router.get(
    "/tracking/links",
    response_model=list[TrackedLinkRead],
    summary="List the tracked links",
    description="One link per DM, with its destination (UTM) and its clicks. Newest first.",
)
def list_links(
    session: SessionDep, account_id: str | None = None, post_id: int | None = None
) -> list[TrackedLinkRead]:
    return [service.to_read(link) for link in service.list_links(session, account_id, post_id)]


@router.get(
    "/tracking/stats",
    response_model=TrackingStats,
    summary="DM click-through rate",
    description="Sent DMs, clicked links and click-through rate (PRD KPI « Taux de clic DM »), in total and per post.",
)
def get_stats(session: SessionDep, account_id: str | None = None) -> TrackingStats:
    return service.stats(session, account_id)
