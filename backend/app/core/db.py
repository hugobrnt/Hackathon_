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
    from app.domains.accounts import models as _accounts  # noqa: F401
    from app.domains.content import models as _content  # noqa: F401
    from app.domains.webhooks import models as _webhooks  # noqa: F401
    from app.domains.classification import models as _classification  # noqa: F401

    engine = engine or get_engine()
    SQLModel.metadata.create_all(engine)
    add_missing_columns(engine)


def add_missing_columns(engine: Engine) -> None:
    """Minimal migration: add the new nullable columns to the existing tables.

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
                if not column.nullable:
                    raise RuntimeError(f"Cannot add the NOT NULL column {table.name}.{column.name}.")
                column_type = column.type.compile(dialect=engine.dialect)
                connection.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}'))


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
