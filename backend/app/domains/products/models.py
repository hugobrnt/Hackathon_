from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now


class BusinessType(StrEnum):
    """Profile of the user (PRD personas): SaaS builder (Léa) or e-commerce merchant (Karim)."""

    saas = "saas"
    ecommerce = "ecommerce"


class Product(SQLModel, table=True):
    """One product or landing page of the catalog of an account (F7 bis).

    - saas: `landing_url` is the landing page, `description` is a free text on what the SaaS offers.
    - ecommerce: `landing_url` is the product page, `description` gives the facts
      (price, sizes, delivery, returns, guarantees).
    """

    __tablename__ = "products"

    id: int | None = Field(default=None, primary_key=True)
    account_id: str = Field(foreign_key="social_accounts.id", index=True)
    business_type: BusinessType = BusinessType.ecommerce
    title: str
    landing_url: str
    description: str
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
