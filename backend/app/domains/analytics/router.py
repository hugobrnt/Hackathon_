from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.analytics import service
from app.domains.analytics.schemas import PostDetail, PostIntentStats, PostSortKey

router = APIRouter(prefix="/analytics", tags=["analytics"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get(
    "/posts",
    response_model=list[PostIntentStats],
    summary="Rank the posts by purchase intent",
    description=(
        "Returns each post with its Purchase Intent Rate and Intent Score, sorted from best to worst. "
        "Intent Score = (purchase × 3 + question × 2 + objection × 1) ÷ total comments."
    ),
)
def get_post_rankings(
    session: SessionDep,
    account_id: Annotated[str | None, Query(description="Filter by Zernio accountId.")] = None,
    sort: Annotated[PostSortKey, Query(description="Sort key (descending).")] = PostSortKey.intent_score,
    min_comments: Annotated[
        int, Query(ge=0, description="Hide the posts with fewer comments (small samples give extreme rates).")
    ] = 0,
) -> list[PostIntentStats]:
    return service.post_stats(session, account_id=account_id, sort=sort, min_comments=min_comments)


@router.get(
    "/posts/{post_id}",
    response_model=PostDetail,
    summary="Detail of one post (F6)",
    description=(
        "Stats of the post (intent breakdown, Purchase Intent Rate, Intent Score, platform metrics), "
        "its key comments and all its comments with their classification."
    ),
    responses={404: {"model": ErrorResponse, "description": "Post not found."}},
)
def get_post_detail(post_id: int, session: SessionDep) -> PostDetail:
    detail = service.post_detail(session, post_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return detail
