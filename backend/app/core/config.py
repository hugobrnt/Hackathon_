"""Application settings, read from environment variables and `backend/.env`."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    zernio_api_key: str = ""
    zernio_base_url: str = "https://zernio.com/api/v1"
    zernio_profile_id: str | None = None
    zernio_timeout_seconds: float = 20.0
    # Shared secret for the HMAC-SHA256 signature of the Zernio webhooks.
    zernio_webhook_secret: str = ""

    # Cloudflare Workers AI (F3 classification). Without them, a keyword heuristic is used.
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = ""
    cloudflare_ai_gateway_id: str | None = None
    classifier_small_model: str = "@cf/meta/llama-3.1-8b-instruct"
    classifier_large_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    # Below this confidence, the small model result goes to the large model.
    classifier_escalation_threshold: float = 0.7
    # Below this confidence, a human must validate before an automatic action.
    classifier_review_threshold: float = 0.5
    classifier_concurrency: int = 4

    # Auto-DM (F7)
    auto_dm_max_age_days: int = 7  # Meta accepts a private reply up to 7 days after the comment.

    # Ads (F9): guardrail of the PRD, a boost cannot spend more than this total amount.
    ads_max_total_budget: float = 50.0

    # F13: automatic replies of the agent in one conversation, before a human takes over.
    agent_max_replies: int = 3
    # F13: the agent also answers the prospects who write a DM first (purchase, question, objection).
    agent_reply_inbound_dms: bool = True

    database_url: str = f"sqlite:///{BACKEND_DIR / 'data.db'}"
    public_base_url: str = "http://localhost:8000"
    # Public base URL of the short links in the DMs (F8). Default: PUBLIC_BASE_URL.
    tracking_base_url: str | None = None
    frontend_url: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
