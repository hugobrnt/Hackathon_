from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.conversations import service
from app.domains.conversations.models import ConversationStatus
from app.domains.conversations.schemas import ConversationDetail, ConversationSummary

router = APIRouter(prefix="/conversations", tags=["conversations"])

SessionDep = Annotated[Session, Depends(get_session)]


def _errors(*codes: int) -> dict[int | str, dict[str, Any]]:
    return {code: {"model": ErrorResponse} for code in codes}


@router.get(
    "",
    response_model=list[ConversationSummary],
    summary="List the conversations of the agent",
    description=(
        "The DM conversations started by an auto-DM, most recent first. `needs_attention` is true when a human "
        "must take over. Filter with `status=handed_off` for the conversations to answer."
    ),
)
def list_conversations(
    session: SessionDep, account_id: str | None = None, status: ConversationStatus | None = None
) -> list[ConversationSummary]:
    return service.list_conversations(session, account_id, status)


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetail,
    summary="Read a conversation",
    description="The comment that started it, then all the DMs in order, with who sent each one (agent, prospect, human).",
    responses=_errors(404),
)
def get_conversation(conversation_id: int, session: SessionDep) -> ConversationDetail:
    try:
        return service.detail(session, conversation_id)
    except service.ConversationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "/{conversation_id}/handoff",
    response_model=ConversationSummary,
    summary="Take over a conversation",
    description="The agent stops answering. The user answers in Instagram or in the Zernio inbox.",
    responses=_errors(404, 409),
)
def handoff(conversation_id: int, session: SessionDep) -> ConversationSummary:
    try:
        return service.handoff(session, conversation_id)
    except service.ConversationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "/{conversation_id}/resume",
    response_model=ConversationSummary,
    summary="Give the conversation back to the agent",
    description="The agent answers again, with a new budget of automatic replies. Impossible if the prospect said stop.",
    responses=_errors(404, 409),
)
def resume(conversation_id: int, session: SessionDep) -> ConversationSummary:
    try:
        return service.resume(session, conversation_id)
    except service.ConversationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
