from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.classification import service
from app.domains.classification.classifiers import Classifier, get_classifier
from app.domains.classification.schemas import (
    ClassificationRead,
    ClassificationRunRequest,
    ClassificationRunResult,
    ManualClassification,
)
from app.domains.content.models import Message

router = APIRouter(tags=["classification"])

SessionDep = Annotated[Session, Depends(get_session)]
ClassifierDep = Annotated[Classifier, Depends(get_classifier)]
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse, "description": "Message not found."}}


@router.post(
    "/classification/run",
    response_model=ClassificationRunResult,
    summary="Classify the messages",
    description=(
        "Classifies the incoming comments and DMs without a result (or all of them with `force`). "
        "Workers AI small model first, large model if the confidence is low, keyword heuristic as fallback."
    ),
)
async def run_classification(
    session: SessionDep, classifier: ClassifierDep, request: ClassificationRunRequest | None = None
) -> ClassificationRunResult:
    return await service.run_classification(session, classifier, request or ClassificationRunRequest())


@router.post(
    "/messages/{message_id}/classify",
    response_model=ClassificationRead,
    summary="Classify one message again",
    responses=NOT_FOUND,
)
async def classify_message(message_id: int, session: SessionDep, classifier: ClassifierDep) -> ClassificationRead:
    message = session.get(Message, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    await service.classify_messages(session, classifier, [message])
    row = service.get_for_messages(session, [message_id]).get(message_id)
    if row is None:
        raise HTTPException(status_code=502, detail="Classification failed.")
    return ClassificationRead.model_validate(row)


@router.put(
    "/messages/{message_id}/classification",
    response_model=ClassificationRead,
    summary="Set the classification by hand",
    description="Human label (confidence 1.0). Use it to correct a result or to build the evaluation set.",
    responses=NOT_FOUND,
)
def set_classification(message_id: int, payload: ManualClassification, session: SessionDep) -> ClassificationRead:
    if session.get(Message, message_id) is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    return ClassificationRead.model_validate(service.set_manual(session, message_id, payload))
