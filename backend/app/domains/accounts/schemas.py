from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class SupportedPlatform(StrEnum):
    """Platforms that the product supports. The PRD limits the demo to Instagram."""

    instagram = "instagram"
    facebook = "facebook"
    linkedin = "linkedin"
    twitter = "twitter"
    tiktok = "tiktok"


class ConnectUrlResponse(BaseModel):
    auth_url: str = Field(description="Zernio OAuth URL. Open it in a browser to connect the account.")


class SocialAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="Zernio accountId.")
    platform: str
    username: str | None
    profile_id: str | None
    is_demo: bool
    connected_at: datetime
    last_imported_at: datetime | None
