from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import Engine
from sqlmodel import Session

from app.core.db import get_engine, get_session
from app.core.errors import ZERNIO_ERROR_RESPONSES
from app.domains.accounts.models import SocialAccount
from app.domains.classification.classifiers import Classifier, get_classifier
from app.domains.classification.service import classify_in_background
from app.domains.ingestion import demo, service
from app.domains.ingestion.schemas import ImportResult
from app.integrations.zernio.client import ZernioClient, get_zernio_client

router = APIRouter(tags=["ingestion"])

SessionDep = Annotated[Session, Depends(get_session)]
ZernioDep = Annotated[ZernioClient, Depends(get_zernio_client)]
EngineDep = Annotated[Engine, Depends(get_engine)]
ClassifierDep = Annotated[Classifier, Depends(get_classifier)]


@router.post(
    "/accounts/{account_id}/import",
    response_model=ImportResult,
    summary="Import posts, comments and DMs of an account",
    description=(
        "Reads the 25 most recent posts of the account, their comments (with replies) and the "
        "DM conversations from Zernio. The import is idempotent: run it again to refresh the data. "
        "The new messages are classified in the background (F3)."
    ),
    responses=ZERNIO_ERROR_RESPONSES,
)
async def import_account(
    account_id: str,
    session: SessionDep,
    zernio: ZernioDep,
    background_tasks: BackgroundTasks,
    engine: EngineDep,
    classifier: ClassifierDep,
) -> ImportResult:
    account = session.get(SocialAccount, account_id)
    if account is None:
        raise HTTPException(
            status_code=404,
            detail="Account not found. Connect it or run POST /accounts/sync first.",
        )
    if account.is_demo:
        raise HTTPException(status_code=400, detail="Use POST /demo/load for the demo account.")
    result = await service.import_account(session, zernio, account)
    background_tasks.add_task(classify_in_background, engine, classifier, None, account.id)
    return result


@router.post(
    "/demo/load",
    response_model=ImportResult,
    summary="Load the demo dataset",
    description="Loads realistic demo posts, comments and DMs. Use it if the Zernio API or the account fails.",
)
def load_demo(
    session: SessionDep, background_tasks: BackgroundTasks, engine: EngineDep, classifier: ClassifierDep
) -> ImportResult:
    result = demo.load_demo_data(session)
    background_tasks.add_task(classify_in_background, engine, classifier, None, result.account_id)
    return result
