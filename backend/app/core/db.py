"""Database engine and session dependency (SQLite through SQLModel)."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


def init_db(engine: Engine | None = None) -> None:
    # Import the models so that SQLModel registers their tables.
    from app.domains.replies import models as _replies  # noqa: F401
    from app.domains.auth import models as _auth  # noqa: F401
    from app.domains.accounts import models as _accounts  # noqa: F401
    from app.domains.content import models as _content  # noqa: F401
    from app.domains.webhooks import models as _webhooks  # noqa: F401
    from app.domains.classification import models as _classification  # noqa: F401
    from app.domains.outreach import models as _outreach  # noqa: F401
    from app.domains.products import models as _products  # noqa: F401
    from app.domains.tracking import models as _tracking  # noqa: F401
    from app.domains.ads import models as _ads  # noqa: F401
    from app.domains.insights import models as _insights  # noqa: F401
    from app.domains.conversations import models as _conversations  # noqa: F401

    from app.domains.conversations.migrations import copy_legacy_conversations, rename_legacy_conversations
    from app.domains.products.migrations import copy_legacy_products, rename_legacy_products

    engine = engine or get_engine()
    copy_products = rename_legacy_products(engine)
    copy_conversations = rename_legacy_conversations(engine)
    SQLModel.metadata.create_all(engine)
    if copy_products:
        copy_legacy_products(engine)
    if copy_conversations:
        copy_legacy_conversations(engine)
    add_missing_columns(engine)


def add_missing_columns(engine: Engine) -> None:
    """Minimal migration: add the new columns (nullable, or NOT NULL with a server default).

    `create_all` creates the missing tables but does not change an existing table.
    """
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in SQLModel.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                column_type = column.type.compile(dialect=engine.dialect)
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}'
                default = column.server_default
                if not column.nullable:
                    if default is None or not hasattr(default, "arg"):
                        raise RuntimeError(f"Cannot add the NOT NULL column {table.name}.{column.name}.")
                    ddl += f" NOT NULL DEFAULT '{default.arg}'"
                connection.execute(text(ddl))


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
