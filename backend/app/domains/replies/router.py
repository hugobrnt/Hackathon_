from typing import Annotated, Literal
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session
from app.core.db import get_session
from app.domains.accounts.models import SocialAccount, utc_now
from app.domains.replies.models import ReplySettings

router = APIRouter(
    prefix="/accounts/{account_id}/reply-settings", tags=["reply settings"]
)
SessionDep = Annotated[Session, Depends(get_session)]


class ReplySettingsInput(BaseModel):
    tone: Literal["friendly", "professional", "concise"] = "friendly"
    goal: Literal["product_visit", "trial", "demo"] = "product_visit"
    escalation_topics: str = Field(
        default="",
        max_length=1000,
        description="Comma-separated terms that require human approval, matched case-insensitively in the incoming comment.",
    )


class ReplySettingsRead(ReplySettingsInput):
    model_config = ConfigDict(from_attributes=True)
    account_id: str
    updated_at: datetime


def get_settings(session: Session, account_id: str) -> ReplySettings:
    if session.get(SocialAccount, account_id) is None:
        raise HTTPException(404, "Account not found.")
    return session.get(ReplySettings, account_id) or ReplySettings(
        account_id=account_id
    )


@router.get(
    "", response_model=ReplySettingsRead, summary="Read reply preferences for a channel"
)
def read(account_id: str, session: SessionDep) -> ReplySettingsRead:
    return ReplySettingsRead.model_validate(get_settings(session, account_id))


@router.put(
    "",
    response_model=ReplySettingsRead,
    summary="Save tone, goal and human-review topics",
)
def update(
    account_id: str, payload: ReplySettingsInput, session: SessionDep
) -> ReplySettingsRead:
    row = get_settings(session, account_id)
    row.tone, row.goal, row.escalation_topics = (
        payload.tone,
        payload.goal,
        payload.escalation_topics.strip(),
    )
    row.updated_at = utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return ReplySettingsRead.model_validate(row)
