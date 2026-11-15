"""Email/password authentication for one local brand, not a multi-tenant service."""

import hashlib
import hmac
import secrets
from datetime import UTC, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.domains.accounts.models import utc_now
from app.domains.auth.models import LoginSession, LoginThrottle, WorkspaceOwner

router = APIRouter(prefix="/auth", tags=["authentication"])
SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
COOKIE = "signal_session"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    value = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    ).hex()
    return salt + ":" + value


def check_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != settings.frontend_url.rstrip("/"):
        raise HTTPException(403, "Unrecognized request origin.")


def current_owner(request: Request, session: SessionDep) -> WorkspaceOwner:
    token = request.cookies.get(COOKIE, "")
    row = session.get(LoginSession, digest(token)) if token else None
    if row is None or row.expires_at.replace(tzinfo=UTC) <= utc_now():
        raise HTTPException(401, "Please sign in to continue.")
    owner = session.get(WorkspaceOwner, 1)
    if owner is None:
        raise HTTPException(401, "Please sign in to continue.")
    return owner


def require_session(
    request: Request, session: SessionDep, settings: SettingsDep
) -> None:
    path = request.url.path
    if (
        path.startswith("/auth/")
        or path in {"/health", "/accounts/callback", "/webhooks/zernio"}
        or path.startswith("/r/")
    ):
        return
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request, settings)
    current_owner(request, session)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=256)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if (
            "@" not in value
            or "." not in value.rsplit("@", 1)[-1]
            or any(c.isspace() for c in value)
        ):
            raise ValueError("Enter a valid email address.")
        return value


class Registration(Credentials):
    name: str = Field(min_length=1, max_length=100)


class OwnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    email: str
    name: str


class AuthStatus(BaseModel):
    registration_open: bool


class LogoutResult(BaseModel):
    signed_out: bool


def issue_session(session: Session, response: Response, settings: Settings) -> None:
    token = secrets.token_urlsafe(32)
    session.add(
        LoginSession(token_hash=digest(token), expires_at=utc_now() + timedelta(days=7))
    )
    session.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=7 * 86400,
        httponly=True,
        secure=settings.frontend_url.startswith("https://"),
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"


@router.get(
    "/status",
    response_model=AuthStatus,
    summary="Whether the local workspace needs an owner",
)
def status(session: SessionDep) -> AuthStatus:
    return AuthStatus(registration_open=session.get(WorkspaceOwner, 1) is None)


@router.post(
    "/register",
    response_model=OwnerRead,
    status_code=201,
    summary="Create the local workspace owner",
)
def register(
    payload: Registration,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
) -> OwnerRead:
    check_origin(request, settings)
    if session.get(WorkspaceOwner, 1) is not None:
        raise HTTPException(
            409, "This workspace already has an account. Sign in instead."
        )
    owner = WorkspaceOwner(
        email=payload.email,
        name=payload.name.strip(),
        password_hash=password_hash(payload.password),
    )
    session.add(owner)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            409, "This workspace already has an account. Sign in instead."
        ) from exc
    issue_session(session, response, settings)
    return OwnerRead.model_validate(owner)


@router.post(
    "/login", response_model=OwnerRead, summary="Sign in with email and password"
)
def login(
    payload: Credentials,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
) -> OwnerRead:
    check_origin(request, settings)
    key = digest(request.client.host if request.client else "local")
    throttle = session.get(LoginThrottle, key) or LoginThrottle(key=key)
    if utc_now() - throttle.window_started.replace(tzinfo=UTC) > timedelta(minutes=15):
        throttle.attempts, throttle.window_started = 0, utc_now()
    if throttle.attempts >= 10:
        raise HTTPException(429, "Too many sign-in attempts. Try again in 15 minutes.")
    owner = session.get(WorkspaceOwner, 1)
    stored = owner.password_hash if owner else "00" * 16 + ":" + "00" * 64
    actual = password_hash(payload.password, stored.split(":")[0])
    if (
        owner is None
        or not hmac.compare_digest(actual, stored)
        or owner.email != payload.email
    ):
        throttle.attempts += 1
        session.add(throttle)
        session.commit()
        raise HTTPException(401, "Email or password is incorrect.")
    throttle.attempts = 0
    session.add(throttle)
    issue_session(session, response, settings)
    return OwnerRead.model_validate(owner)


@router.get("/me", response_model=OwnerRead, summary="Read the signed-in account")
def me(request: Request, response: Response, session: SessionDep) -> OwnerRead:
    response.headers["Cache-Control"] = "no-store"
    return OwnerRead.model_validate(current_owner(request, session))


@router.post(
    "/logout", response_model=LogoutResult, summary="Revoke the current session"
)
def logout(
    request: Request, response: Response, session: SessionDep, settings: SettingsDep
) -> LogoutResult:
    check_origin(request, settings)
    token = request.cookies.get(COOKIE, "")
    row = session.get(LoginSession, digest(token)) if token else None
    if row:
        session.delete(row)
        session.commit()
    response.delete_cookie(COOKIE, path="/")
    return LogoutResult(signed_out=True)
