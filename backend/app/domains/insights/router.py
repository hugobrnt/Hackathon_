from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.insights import service
from app.domains.insights.grouping import ThemeGrouper, get_theme_grouper
from app.domains.insights.schemas import InsightsReport, InsightsRunRequest

router = APIRouter(prefix="/insights", tags=["insights"])

SessionDep = Annotated[Session, Depends(get_session)]
GrouperDep = Annotated[ThemeGrouper, Depends(get_theme_grouper)]


@router.post(
    "/run",
    response_model=InsightsReport,
    summary="Group the messages into themes",
    description=(
        "Groups the classified comments and DMs of an account (or of one post) into themes: objections, "
        "feature requests, needs (pre-purchase questions) and praise. Each theme has a title, a summary, "
        "a number of mentions and real quotes without usernames. The result is saved."
    ),
    responses={404: {"model": ErrorResponse, "description": "Account not found."}},
)
async def run_insights(payload: InsightsRunRequest, session: SessionDep, grouper: GrouperDep) -> InsightsReport:
    try:
        return await service.run(session, grouper, payload)
    except service.InsightsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get(
    "",
    response_model=InsightsReport,
    summary="Last insights of an account",
    description="The top themes per category of the last run (Insights tab of the dashboard).",
    responses={404: {"model": ErrorResponse, "description": "No run yet."}},
)
def get_insights(
    session: SessionDep,
    account_id: str,
    post_id: int | None = None,
    top: Annotated[int, Query(ge=1, le=20)] = 5,
) -> InsightsReport:
    try:
        return service.latest(session, account_id, post_id, top)
    except service.InsightsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
