from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from app.domains.auth.router import router as auth_router, require_session
from fastapi.middleware.cors import CORSMiddleware

from app.domains.replies.router import router as replies_router
from app.core.config import get_settings
from app.core.db import init_db
from app.core.errors import register_error_handlers
from app.domains.accounts.router import router as accounts_router
from app.domains.analytics.router import router as analytics_router
from app.domains.classification.router import router as classification_router
from app.domains.content.router import router as content_router
from app.domains.ingestion.router import router as ingestion_router
from app.domains.outreach.router import router as outreach_router
from app.domains.products.router import router as products_router
from app.domains.tracking.router import router as tracking_router
from app.domains.ads.router import router as ads_router
from app.domains.insights.router import router as insights_router
from app.domains.conversations.router import router as conversations_router
from app.domains.webhooks.router import router as webhooks_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Social Intent Converter API",
        dependencies=[Depends(require_session)],
        version="0.1.0",
        description="Detects purchase intent in social comments and DMs (Zernio + FastAPI).",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[get_settings().frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    # The ingestion router goes first: `/accounts/{account_id}/import` must not be
    # shadowed by other `/accounts/...` routes.
    app.include_router(auth_router)
    app.include_router(replies_router)
    app.include_router(ingestion_router)
    app.include_router(accounts_router)
    app.include_router(content_router)
    app.include_router(webhooks_router)
    app.include_router(classification_router)
    app.include_router(analytics_router)
    app.include_router(outreach_router)
    app.include_router(products_router)
    app.include_router(tracking_router)
    app.include_router(ads_router)
    app.include_router(insights_router)
    app.include_router(conversations_router)

    @app.get("/health", tags=["system"], summary="Health check")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
