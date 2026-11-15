"""A single owner and revocable sessions for the local brand workspace."""

from datetime import datetime
from sqlmodel import Field, SQLModel
from app.domains.accounts.models import utc_now


class WorkspaceOwner(SQLModel, table=True):
    __tablename__ = "workspace_owner"
    id: int = Field(default=1, primary_key=True)
    email: str
    name: str
    password_hash: str
    created_at: datetime = Field(default_factory=utc_now)


class LoginSession(SQLModel, table=True):
    __tablename__ = "login_sessions"
    token_hash: str = Field(primary_key=True)
    expires_at: datetime


class LoginThrottle(SQLModel, table=True):
    __tablename__ = "login_throttle"
    key: str = Field(primary_key=True)
    attempts: int = 0
    window_started: datetime = Field(default_factory=utc_now)


class ConnectState(SQLModel, table=True):
    __tablename__ = "connect_states"
    token_hash: str = Field(primary_key=True)
    profile_id: str
    expires_at: datetime
