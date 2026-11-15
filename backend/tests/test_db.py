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
