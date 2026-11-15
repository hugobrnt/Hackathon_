from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class SupportedPlatform(StrEnum):
    """Social platforms with the hosted Zernio OAuth flow."""

    instagram = "instagram"
    facebook = "facebook"
    linkedin = "linkedin"
    twitter = "twitter"
    tiktok = "tiktok"
    youtube = "youtube"
    pinterest = "pinterest"
    reddit = "reddit"
    threads = "threads"
    googlebusiness = "googlebusiness"
    snapchat = "snapchat"


class ConnectUrlResponse(BaseModel):
    auth_url: str = Field(
        description="Zernio OAuth URL. Open it in a browser to connect the account."
    )


class SocialAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="Zernio accountId.")
    platform: str
    username: str | None
    profile_id: str | None
    is_active: bool | None = None
    needs_reconnection: bool | None = None
    is_demo: bool
    connected_at: datetime
    last_imported_at: datetime | None
