from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.domains.accounts.models import utc_now


class BusinessType(StrEnum):
    """Profile of the user (PRD personas): SaaS builder (Léa) or e-commerce merchant (Karim)."""

    saas = "saas"
    ecommerce = "ecommerce"


class Product(SQLModel, table=True):
    """What the user sells with an account (F7 bis). One product per account.

    - saas: `landing_url` is the landing page, `description` is a free text on what the SaaS offers.
    - ecommerce: `landing_url` is the product page, `description` gives the facts
      (price, sizes, delivery, returns, guarantees).
    """

    __tablename__ = "products"

    account_id: str = Field(foreign_key="social_accounts.id", primary_key=True)
    business_type: BusinessType = Field(
        default=BusinessType.ecommerce, sa_column_kwargs={"server_default": BusinessType.ecommerce.value}
    )
    name: str
    landing_url: str
    description: str
    updated_at: datetime = Field(default_factory=utc_now)
