from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app.core.db import init_db


def test_init_db_adds_new_columns_to_an_old_table() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE posts (id INTEGER PRIMARY KEY, external_id VARCHAR NOT NULL, account_id VARCHAR NOT NULL, "
            "platform VARCHAR NOT NULL, caption VARCHAR NOT NULL, comment_count INTEGER NOT NULL, like_count INTEGER NOT NULL)"
        ))
        connection.execute(text("INSERT INTO posts VALUES (1, 'p1', 'a', 'instagram', '', 0, 0)"))
    init_db(engine)
    columns = {c["name"] for c in inspect(engine).get_columns("posts")}
    assert {"view_count", "share_count", "repost_count", "metrics_updated_at", "permalink"} <= columns
    with engine.connect() as connection:
        assert connection.execute(text("SELECT view_count FROM posts")).scalar() is None


def test_init_db_adds_not_null_column_with_server_default() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE products (account_id VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, "
            "landing_url VARCHAR NOT NULL, description VARCHAR NOT NULL, updated_at DATETIME NOT NULL)"
        ))
        connection.execute(text("INSERT INTO products VALUES ('a', 'n', 'https://x', 'desc', '2026-11-15')"))
    init_db(engine)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT business_type FROM products")).scalar() == "ecommerce"
