"""Read and confirm uncertain product matches without generating or sending messages."""
from datetime import datetime
from pydantic import BaseModel, Field
from sqlmodel import Session, col, or_, select
from app.domains.accounts.models import SocialAccount
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import Intent
from app.domains.content.models import Message, MessageDirection, Post
from app.domains.products.models import Product
from app.domains.products.service import ProductError


class ProductReviewItem(BaseModel):
    message_id: int
    account_id: str
    text: str
    author_name: str | None
    kind: str
    created_time: datetime | None
    post_id: int | None
    post_caption: str | None
    intent: str
    suggested_product_id: int | None
    suggested_product_title: str | None
    product_confidence: float | None


class ProductReviewPage(BaseModel):
    items: list[ProductReviewItem]
    next_cursor: int | None = None


class ConfirmProduct(BaseModel):
    product_id: int = Field(gt=0)


class ConfirmedProduct(BaseModel):
    message_id: int
    product_id: int
    product_title: str
    product_confidence: float = 1


def pending(session: Session, account_id: str, post_id: int | None, before: int | None, limit: int) -> ProductReviewPage:
    if session.get(SocialAccount, account_id) is None:
        raise ProductError(404, "Account not found.")
    query = (select(Message, MessageClassification, Post, Product)
        .join(MessageClassification, col(MessageClassification.message_id) == col(Message.id))
        .outerjoin(Post, col(Post.id) == col(Message.post_id))
        .outerjoin(Product, col(Product.id) == col(MessageClassification.product_id))
        .where(Message.account_id == account_id, Message.direction == MessageDirection.incoming,
               col(Message.author_is_owner).is_(False), Message.text != "",
               MessageClassification.intent != Intent.neutral_spam,
               or_(col(Product.id).is_(None), col(Product.is_active).is_(False),
                   col(MessageClassification.product_confidence).is_(None),
                   col(MessageClassification.product_confidence) < 0.7)))
    if post_id is not None:
        query = query.where(Message.post_id == post_id)
    if before is not None:
        query = query.where(col(Message.id) < before)
    rows = list(session.exec(query.order_by(col(Message.id).desc()).limit(limit + 1)))
    items = [ProductReviewItem(
        message_id=m.id, account_id=m.account_id, text=m.text, author_name=m.author_name,
        kind=m.kind.value, created_time=m.created_time, post_id=m.post_id,
        post_caption=p.caption if p else None, intent=c.intent.value,
        suggested_product_id=c.product_id, suggested_product_title=product.title if product else None,
        product_confidence=c.product_confidence,
    ) for m, c, p, product in rows[:limit] if m.id is not None]
    return ProductReviewPage(items=items, next_cursor=items[-1].message_id if len(rows) > limit and items else None)


def confirm(session: Session, message_id: int, product_id: int) -> ConfirmedProduct:
    message = session.get(Message, message_id)
    classification = session.get(MessageClassification, message_id)
    if message is None or classification is None:
        raise ProductError(404, "Classified message not found.")
    if message.direction != MessageDirection.incoming or message.author_is_owner:
        raise ProductError(400, "Only audience messages can be matched.")
    product = session.get(Product, product_id)
    if product is None or product.account_id != message.account_id or not product.is_active:
        raise ProductError(400, "Choose an active product on the message's channel.")
    classification.product_id = product_id
    classification.product_confidence = 1.0
    classification.product_reason = "human confirmed"
    session.add(classification)
    session.commit()
    return ConfirmedProduct(message_id=message_id, product_id=product_id, product_title=product.title)
