from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.domains.products.models import BusinessType

DESCRIPTION_HELP = (
    "Required. The LLM uses only these facts (and the post caption) to find the product of a comment and to "
    "answer in the DM. SaaS: what the SaaS offers (problem solved, main features, integrations, pricing, "
    "free trial). E-commerce: the facts on the product (price, sizes, colors, delivery, returns, payment)."
)


class ProductCreate(BaseModel):
    business_type: BusinessType = Field(description="`saas` (SaaS builder) or `ecommerce` (e-commerce merchant).")
    title: str = Field(min_length=1, max_length=100, examples=["Hoodie Maison Karim"])
    landing_url: HttpUrl = Field(
        description="Required. SaaS: the landing page. E-commerce: the product page. The DM links to it.",
        examples=["https://shop.example/hoodie"],
    )
    description: str = Field(
        min_length=20,
        max_length=2000,
        description=DESCRIPTION_HELP,
        examples=["Hoodie en coton bio, 59 €. Tailles XS à XXL. Livraison offerte en France dès 50 €."],
    )
    is_active: bool = True


class ProductUpdate(ProductCreate):
    pass


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: str
    business_type: BusinessType
    title: str
    landing_url: str
    description: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
