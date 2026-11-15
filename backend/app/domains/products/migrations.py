"""One-time migration of the old `products` table (one product per account, primary key `account_id`)."""

from sqlalchemy import Engine, inspect, text


def rename_legacy_products(engine: Engine) -> bool:
    """Before `create_all`: rename the old table. Returns True if a copy is needed after `create_all`."""
    inspector = inspect(engine)
    if not inspector.has_table("products"):
        return False
    columns = {c["name"] for c in inspector.get_columns("products")}
    if "id" in columns:
        return False
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE products RENAME TO products_legacy"))
    return True


def copy_legacy_products(engine: Engine) -> None:
    """After `create_all`: copy the old rows into the catalog, then drop the old table."""
    columns = {c["name"] for c in inspect(engine).get_columns("products_legacy")}
    business_type = "COALESCE(business_type, 'ecommerce')" if "business_type" in columns else "'ecommerce'"
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO products (account_id, business_type, title, landing_url, description, is_active, "
                "created_at, updated_at) "
                f"SELECT account_id, {business_type}, name, landing_url, description, 1, "
                "updated_at, updated_at FROM products_legacy"
            )
        )
        connection.execute(text("DROP TABLE products_legacy"))
