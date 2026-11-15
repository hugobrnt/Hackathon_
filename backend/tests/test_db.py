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


def test_init_db_migrates_the_one_product_table() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE products (account_id VARCHAR PRIMARY KEY, business_type VARCHAR NOT NULL DEFAULT 'ecommerce', "
            "name VARCHAR NOT NULL, landing_url VARCHAR NOT NULL, description VARCHAR NOT NULL, updated_at DATETIME NOT NULL)"
        ))
        connection.execute(text("INSERT INTO products VALUES ('a', 'saas', 'Bot', 'https://x', 'desc', '2026-11-15')"))
    init_db(engine)
    assert not inspect(engine).has_table("products_legacy")
    with engine.connect() as connection:
        row = connection.execute(text("SELECT id, account_id, business_type, title, is_active FROM products")).one()
    assert tuple(row) == (1, "a", "saas", "Bot", 1)


def test_init_db_rebuilds_old_agent_conversations() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE agent_conversations (id INTEGER PRIMARY KEY, account_id VARCHAR NOT NULL, "
            "dm_attempt_id INTEGER NOT NULL, post_id INTEGER NOT NULL, product_id INTEGER, recipient_id VARCHAR, "
            "recipient_name VARCHAR, conversation_id VARCHAR, status VARCHAR NOT NULL, handoff_reason VARCHAR, "
            "agent_replies INTEGER NOT NULL, agent_message_ids JSON NOT NULL, last_message_at DATETIME, "
            "created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO agent_conversations VALUES (1, 'a', 7, 3, NULL, 'u', 'u', 'c', 'active', NULL, 1, '[]', "
            "NULL, '2026-11-15', '2026-11-15')"
        ))
    init_db(engine)
    columns = {c["name"]: c for c in inspect(engine).get_columns("agent_conversations")}
    assert columns["dm_attempt_id"]["nullable"] and columns["post_id"]["nullable"]
    with engine.connect() as connection:
        row = connection.execute(text("SELECT id, dm_attempt_id, source FROM agent_conversations")).one()
    assert tuple(row) == (1, 7, "auto_dm")
