from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ZERNIO_ERROR_RESPONSES, ErrorResponse
from app.domains.classification.models import MessageClassification
from app.domains.content.models import Message
from app.domains.outreach import service
from app.domains.outreach.models import DmStatus
from app.domains.outreach.schemas import (
    ApproveRequest,
    AutoDmRunResult,
    AutoDmSettingsRead,
    AutoDmSettingsUpdate,
    DmAttemptRead,
    DmDraft,
)
from app.domains.outreach.writers import DmWriter, get_dm_writer
from app.integrations.zernio.client import ZernioClient, get_zernio_client

router = APIRouter(tags=["auto-dm"])

SessionDep = Annotated[Session, Depends(get_session)]
ZernioDep = Annotated[ZernioClient, Depends(get_zernio_client)]
WriterDep = Annotated[DmWriter, Depends(get_dm_writer)]


def _errors(*codes: int) -> dict[int | str, dict[str, Any]]:
    return {code: {"model": ErrorResponse} for code in codes}


def _raise(exc: service.OutreachError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get(
    "/posts/{post_id}/auto-dm",
    response_model=AutoDmSettingsRead,
    summary="Auto-DM settings of a post",
    responses=_errors(404),
)
def get_auto_dm_settings(post_id: int, session: SessionDep) -> AutoDmSettingsRead:
    try:
        return AutoDmSettingsRead.model_validate(service.get_post_settings(session, post_id))
    except service.OutreachError as exc:
        raise _raise(exc) from exc


@router.put(
    "/posts/{post_id}/auto-dm",
    response_model=AutoDmSettingsRead,
    summary="Enable or disable the auto-DM on a post",
    description=(
        "When it is on, each new comment classified as purchase, question or objection gets a personalized "
        "private reply in less than 60 s. Negative or uncertain comments wait for a human approval."
    ),
    responses=_errors(400, 404),
)
def put_auto_dm_settings(post_id: int, payload: AutoDmSettingsUpdate, session: SessionDep) -> AutoDmSettingsRead:
    try:
        return AutoDmSettingsRead.model_validate(service.set_post_settings(session, post_id, payload))
    except service.OutreachError as exc:
        raise _raise(exc) from exc


@router.post(
    "/posts/{post_id}/auto-dm/run",
    response_model=AutoDmRunResult,
    summary="Send the auto-DMs of a post now",
    description=(
        "Processes the classified comments of the post that have no DM yet. Use it if the webhooks failed "
        "(PRD: manual Sync). The guardrails apply."
    ),
    responses={**ZERNIO_ERROR_RESPONSES, **_errors(400, 404)},
)
async def run_for_post(post_id: int, session: SessionDep, writer: WriterDep, zernio: ZernioDep) -> AutoDmRunResult:
    try:
        return await service.run_for_post(session, post_id, writer, zernio)
    except service.OutreachError as exc:
        raise _raise(exc) from exc


@router.post(
    "/messages/{message_id}/auto-dm/preview",
    response_model=DmDraft,
    summary="Preview the DM of a comment",
    description="Writes the DM text for this comment without sending it.",
    responses=_errors(404, 409),
)
async def preview(message_id: int, session: SessionDep, writer: WriterDep) -> DmDraft:
    message = session.get(Message, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    classification = session.get(MessageClassification, message_id)
    if classification is None:
        raise HTTPException(status_code=409, detail="The message is not classified yet.")
    try:
        return await service.draft_for(session, message, classification, writer)
    except service.OutreachError as exc:
        raise _raise(exc) from exc


@router.get(
    "/auto-dm/attempts",
    response_model=list[DmAttemptRead],
    summary="List the auto-DMs",
    description="Newest first. Use `status=pending_approval` for the validation queue.",
)
def list_attempts(
    session: SessionDep,
    account_id: str | None = None,
    post_id: int | None = None,
    status: DmStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[DmAttemptRead]:
    return [service.to_read(a, session) for a in service.list_attempts(session, account_id, post_id, status, limit)]


@router.post(
    "/auto-dm/attempts/{attempt_id}/approve",
    response_model=DmAttemptRead,
    summary="Approve and send a pending DM",
    description="Sends a DM in `pending_approval` (or a `failed` DM marked `retryable`). The text can be edited.",
    responses={**ZERNIO_ERROR_RESPONSES, **_errors(400, 404, 409)},
)
async def approve(
    attempt_id: int, session: SessionDep, zernio: ZernioDep, payload: ApproveRequest | None = None
) -> DmAttemptRead:
    try:
        attempt = await service.approve(session, attempt_id, payload.text if payload else None, zernio)
    except service.OutreachError as exc:
        raise _raise(exc) from exc
    return service.to_read(attempt, session)


@router.post(
    "/auto-dm/attempts/{attempt_id}/reject",
    response_model=DmAttemptRead,
    summary="Reject a pending DM",
    responses=_errors(404, 409),
)
def reject(attempt_id: int, session: SessionDep) -> DmAttemptRead:
    try:
        return service.to_read(service.reject(session, attempt_id), session)
    except service.OutreachError as exc:
        raise _raise(exc) from exc
