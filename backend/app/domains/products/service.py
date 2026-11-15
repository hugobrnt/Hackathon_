from sqlmodel import Session, col, select

from app.domains.accounts.models import SocialAccount, utc_now
from app.domains.products.models import Product
from app.domains.products.schemas import ProductCreate, ProductUpdate


class ProductError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def list_products(session: Session, account_id: str, active_only: bool = False) -> list[Product]:
    query = select(Product).where(Product.account_id == account_id)
    if active_only:
        query = query.where(col(Product.is_active).is_(True))
    return list(session.exec(query.order_by(col(Product.id))))


def active_catalog(session: Session, account_id: str) -> list[Product]:
    """The products that the auto-DM can propose: active, with a URL and a description."""
    return [p for p in list_products(session, account_id, active_only=True) if p.landing_url and p.description.strip()]


def get_product(session: Session, product_id: int) -> Product:
    product = session.get(Product, product_id)
    if product is None:
        raise ProductError(404, "Product not found.")
    return product


def _apply(product: Product, data: ProductCreate) -> None:
    product.business_type = data.business_type
    product.title = data.title.strip()
    product.landing_url = str(data.landing_url)
    product.description = data.description.strip()
    product.is_active = data.is_active
    product.updated_at = utc_now()


def create_product(session: Session, account_id: str, data: ProductCreate) -> Product:
    if session.get(SocialAccount, account_id) is None:
        raise ProductError(404, "Account not found.")
    product = Product(account_id=account_id, title="", landing_url="", description="")
    _apply(product, data)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def update_product(session: Session, product_id: int, data: ProductUpdate) -> Product:
    product = get_product(session, product_id)
    _apply(product, data)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def deactivate_product(session: Session, product_id: int) -> Product:
    """Soft delete: the DMs and the links keep their product."""
    product = get_product(session, product_id)
    product.is_active = False
    product.updated_at = utc_now()
    session.add(product)
    session.commit()
    session.refresh(product)
    return product
