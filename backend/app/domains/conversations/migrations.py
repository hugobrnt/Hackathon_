"""Migration of `agent_conversations` when `dm_attempt_id` and `post_id` were NOT NULL (before inbound DMs)."""

from sqlalchemy import Engine, inspect, text

TABLE = "agent_conversations"
LEGACY = "agent_conversations_legacy"


def rename_legacy_conversations(engine: Engine) -> bool:
    """Before `create_all`: rename the old table if it must be rebuilt. True if a copy is needed after."""
    inspector = inspect(engine)
    if inspector.has_table(LEGACY):
        return True  # A previous start stopped between the rename and the copy (for example a reload).
    if not inspector.has_table(TABLE):
        return False
    columns = {c["name"]: c for c in inspector.get_columns(TABLE)}
    if "source" in columns and columns["dm_attempt_id"]["nullable"]:
        return False
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {TABLE} RENAME TO {LEGACY}"))
    return True


def copy_legacy_conversations(engine: Engine) -> None:
    """After `create_all`: copy the old rows (all started by an auto-DM), then drop the old table."""
    old = [c["name"] for c in inspect(engine).get_columns(LEGACY)]
    names = ", ".join(old)
    with engine.begin() as connection:
        connection.execute(
            text(f"INSERT INTO {TABLE} ({names}, source) SELECT {names}, 'auto_dm' FROM {LEGACY}")
        )
        connection.execute(text(f"DROP TABLE {LEGACY}"))
