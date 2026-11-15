from sqlmodel import Session

from app.domains.accounts.models import SocialAccount, utc_now
from app.domains.products.models import Product
from app.domains.products.schemas import ProductUpdate


class AccountNotFoundError(Exception):
    pass


def get_product(session: Session, account_id: str) -> Product | None:
    return session.get(Product, account_id)


def upsert_product(session: Session, account_id: str, update: ProductUpdate) -> Product:
    if session.get(SocialAccount, account_id) is None:
        raise AccountNotFoundError(account_id)
    product = session.get(Product, account_id) or Product(
        account_id=account_id, name=update.name, landing_url=str(update.landing_url), description=update.description
    )
    product.business_type = update.business_type
    product.name = update.name.strip()
    product.landing_url = str(update.landing_url)
    product.description = update.description.strip()
    product.updated_at = utc_now()
    session.add(product)
    session.commit()
    session.refresh(product)
    return product
