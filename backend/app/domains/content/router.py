from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.analytics.service import messages_with_classification
from app.domains.content import repository
from app.domains.content.models import Post
from app.domains.content.schemas import MessageRead, PostRead

router = APIRouter(prefix="/posts", tags=["content"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[PostRead], summary="List the imported posts")
def get_posts(
    session: SessionDep,
    account_id: Annotated[str | None, Query(description="Filter by Zernio accountId.")] = None,
) -> list[PostRead]:
    return [PostRead.model_validate(p) for p in repository.list_posts(session, account_id)]


@router.get(
    "/{post_id}/messages",
    response_model=list[MessageRead],
    summary="List the comments of a post",
    responses={404: {"model": ErrorResponse, "description": "Post not found."}},
)
def get_post_messages(post_id: int, session: SessionDep) -> list[MessageRead]:
    if session.get(Post, post_id) is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return messages_with_classification(session, repository.list_post_messages(session, post_id))
