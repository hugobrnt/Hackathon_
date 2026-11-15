from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.domains.products.models import BusinessType

DESCRIPTION_HELP = (
    "Required for the automatic DMs. The LLM uses only these facts (and the post caption) to answer. "
    "SaaS: a free text on what the SaaS offers (problem solved, main features, integrations, pricing, free trial). "
    "E-commerce: the facts on the product (price, sizes, colors, delivery, returns, payment, guarantees)."
)


class ProductUpdate(BaseModel):
    business_type: BusinessType = Field(description="`saas` (SaaS builder) or `ecommerce` (e-commerce merchant).")
    name: str = Field(min_length=1, max_length=100, examples=["Hoodie Maison Karim"])
    landing_url: HttpUrl = Field(
        description="Required. SaaS: the landing page. E-commerce: the product page. The DM links to it.",
        examples=["https://shop.example/hoodie"],
    )
    description: str = Field(
        min_length=20,
        max_length=2000,
        description=DESCRIPTION_HELP,
        examples=["Hoodie en coton bio, 59 €. Tailles XS à XXL. Livraison offerte en France dès 50 €. Retours gratuits 30 jours."],
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "business_type": "saas",
                    "name": "InvoiceBot",
                    "landing_url": "https://invoicebot.example",
                    "description": "InvoiceBot crée et relance tes factures automatiquement. Intégrations Stripe et "
                    "Shopify, export CSV. Essai gratuit 14 jours, puis 19 €/mois.",
                },
                {
                    "business_type": "ecommerce",
                    "name": "Hoodie Maison Karim",
                    "landing_url": "https://shop.example/hoodie",
                    "description": "Hoodie en coton bio, 59 €. Tailles XS à XXL. Livraison offerte en France "
                    "dès 50 €. Retours gratuits 30 jours.",
                },
            ]
        }
    )


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: str
    business_type: BusinessType
    name: str
    landing_url: str
    description: str
    updated_at: datetime
