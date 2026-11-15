from collections.abc import AsyncIterator, Iterator

import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.core.config import Settings, get_settings
from app.core.db import get_engine, get_session, init_db
from app.domains.classification.classifiers import HeuristicClassifier, get_classifier
from app.integrations.zernio.client import ZernioClient, get_zernio_client
from app.main import create_app

BASE_URL = "https://zernio.test/api/v1"


@pytest.fixture
def settings() -> Settings:
    # `_env_file=None`: the tests must not read the real secrets of backend/.env.
    return Settings(
        _env_file=None,
        zernio_api_key="test-key",
        zernio_base_url=BASE_URL,
        zernio_profile_id="profile-1",
        database_url="sqlite://",
        public_base_url="http://api.test",
        frontend_url="http://front.test",
        zernio_webhook_secret="whsec-test",
    )


@pytest.fixture
def engine() -> Engine:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    init_db(engine)
    return engine


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


@pytest.fixture
def zernio_mock() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def client(engine: Engine, settings: Settings, zernio_mock: respx.MockRouter) -> Iterator[TestClient]:
    app = create_app()

    def override_session() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    async def override_zernio() -> AsyncIterator[ZernioClient]:
        async with ZernioClient(settings) as z:
            yield z

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_zernio_client] = override_zernio
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_engine] = lambda: engine
    app.dependency_overrides[get_classifier] = HeuristicClassifier
    # No `with` block: the lifespan would create tables in the default database.
    yield TestClient(app, follow_redirects=False)
