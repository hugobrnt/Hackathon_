from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy import Engine
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.db import get_engine, get_session
from app.core.errors import ZERNIO_ERROR_RESPONSES, ErrorResponse
from app.domains.classification.classifiers import Classifier, get_classifier
from app.domains.classification.service import classify_in_background
from app.domains.outreach.service import auto_dm_in_background
from app.domains.outreach.writers import DmWriter, get_dm_writer
from app.domains.webhooks import service
from app.domains.webhooks.schemas import (
    RegisterWebhookRequest,
    WebhookAck,
    WebhookEnvelope,
    WebhookRegistration,
    WebhookTestResult,
)
from app.integrations.zernio.client import ZernioClient, ZernioClientFactory, get_zernio_client, get_zernio_client_factory

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

SessionDep = Annotated[Session, Depends(get_session)]
ZernioDep = Annotated[ZernioClient, Depends(get_zernio_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post(
    "/zernio",
    response_model=WebhookAck,
    summary="Receive a Zernio webhook",
    description=(
        "Receives `comment.received`, `message.received` and `message.sent`. The endpoint checks "
        "the HMAC-SHA256 signature in `X-Zernio-Signature`, ignores duplicate event ids, and "
        "stores the comment or the DM. New messages are classified in the background (F3), then the "
        "auto-DM runs for the posts where it is on (F7). "
        "Other events get the status `ignored`."
    ),
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid signature."},
        422: {"model": ErrorResponse, "description": "Invalid payload."},
        503: {"model": ErrorResponse, "description": "`ZERNIO_WEBHOOK_SECRET` is not set. Zernio will retry."},
    },
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": WebhookEnvelope.model_json_schema()}},
        }
    },
)
async def receive_zernio_webhook(
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
    background_tasks: BackgroundTasks,
    engine: Annotated[Engine, Depends(get_engine)],
    classifier: Annotated[Classifier, Depends(get_classifier)],
    dm_writer: Annotated[DmWriter, Depends(get_dm_writer)],
    zernio_factory: Annotated[ZernioClientFactory, Depends(get_zernio_client_factory)],
    x_zernio_signature: Annotated[str | None, Header()] = None,
) -> WebhookAck:
    if not settings.zernio_webhook_secret:
        raise HTTPException(status_code=503, detail="ZERNIO_WEBHOOK_SECRET is not set.")
    # The signature covers the raw body: read it before any JSON parse.
    body = await request.body()
    if not service.is_valid_signature(settings.zernio_webhook_secret, body, x_zernio_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")
    try:
        ack = service.process_event(session, body)
    except service.InvalidPayloadError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {exc}") from exc
    if ack.message_ids:
        # Answer Zernio at once; the LLM call runs after the response.
        background_tasks.add_task(classify_in_background, engine, classifier, ack.message_ids)
        # The tasks run in order: the auto-DM (F7) reads the classification of the step before.
        background_tasks.add_task(auto_dm_in_background, engine, dm_writer, zernio_factory, ack.message_ids)
    return ack


@router.post(
    "/register",
    response_model=WebhookRegistration,
    summary="Register the webhook in Zernio",
    description=(
        "Creates or updates the Zernio webhook that sends the comments and DMs to "
        "`<public_url>/webhooks/zernio`. The URL must be public (for example a cloudflared tunnel)."
    ),
    responses={**ZERNIO_ERROR_RESPONSES, 400: {"model": ErrorResponse, "description": "Missing configuration."}},
)
async def register_webhook(
    zernio: ZernioDep, settings: SettingsDep, payload: RegisterWebhookRequest | None = None
) -> WebhookRegistration:
    if not settings.zernio_webhook_secret:
        raise HTTPException(status_code=400, detail="Set ZERNIO_WEBHOOK_SECRET in backend/.env first.")
    public_url = (payload.public_url if payload else None) or settings.public_base_url
    if "localhost" in public_url or "127.0.0.1" in public_url:
        raise HTTPException(
            status_code=400,
            detail="Zernio cannot reach localhost. Give a public URL (for example a cloudflared tunnel).",
        )
    return await service.register_webhook(zernio, public_url, settings.zernio_webhook_secret)


@router.post(
    "/test",
    response_model=WebhookTestResult,
    summary="Ask Zernio to send a test event",
    description="Zernio sends a `webhook.test` event to the registered webhook.",
    responses={**ZERNIO_ERROR_RESPONSES, 404: {"model": ErrorResponse, "description": "No registered webhook."}},
)
async def test_webhook(zernio: ZernioDep) -> WebhookTestResult:
    webhook = await service.find_registered_webhook(zernio)
    if webhook is None:
        raise HTTPException(status_code=404, detail="No webhook registered. Run POST /webhooks/register first.")
    await zernio.send_test_webhook(webhook.id)
    return WebhookTestResult(webhook_id=webhook.id, sent=True)
