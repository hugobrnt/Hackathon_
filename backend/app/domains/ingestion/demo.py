"""Demo data loader: the plan B of the PRD if the Zernio API or the account fails.

`demo_data.json` uses the same field names as the Zernio API, so the loader uses
the same Zernio schemas and the same save functions as the live import.
"""

import json
from pathlib import Path

from pydantic import BaseModel
from sqlmodel import Session

from app.domains.accounts.models import utc_now
from app.domains.accounts.service import upsert_account
from app.domains.content import repository
from app.domains.ingestion.schemas import ImportResult
from app.domains.products.schemas import ProductCreate
from app.domains.products.service import create_product, list_products
from app.domains.ingestion.service import save_comments, save_dms, save_post
from app.integrations.zernio.schemas import Comment, Conversation, DirectMessage, PlatformPost

DEMO_DATA_PATH = Path(__file__).with_name("demo_data.json")


class DemoAccount(BaseModel):
    id: str
    platform: str
    username: str


class DemoPost(PlatformPost):
    comments: list[Comment] = []
    views: int | None = None
    reposts: int | None = None


class DemoConversation(Conversation):
    messages: list[DirectMessage] = []


class DemoDataset(BaseModel):
    account: DemoAccount
    products: list[ProductCreate] = []
    posts: list[DemoPost]
    conversations: list[DemoConversation] = []


def load_demo_data(session: Session, path: Path = DEMO_DATA_PATH) -> ImportResult:
    dataset = DemoDataset.model_validate(json.loads(path.read_text(encoding="utf-8")))
    account = upsert_account(
        session,
        dataset.account.id,
        dataset.account.platform,
        dataset.account.username,
        profile_id=None,
        is_demo=True,
    )
    # The demo catalog is exactly the dataset catalog: older demo products are deactivated.
    wanted = {p.title for p in dataset.products}
    existing = {}
    for row in list_products(session, account.id):
        existing[row.title] = row
        if row.title not in wanted and row.is_active:
            row.is_active = False
            session.add(row)
    session.commit()
    for product in dataset.products:
        if product.title not in existing:
            create_product(session, account.id, product)
    result = ImportResult(account_id=account.id)
    for demo_post in dataset.posts:
        post = save_post(session, account, demo_post)
        repository.update_post_metrics(
            post,
            views=demo_post.views,
            likes=None,
            shares=demo_post.share_count,
            reposts=demo_post.reposts,
            updated_at=utc_now(),
        )
        result.posts += 1
        result.metrics += 1
        save_comments(session, account, post, demo_post.comments, result)
    for conversation in dataset.conversations:
        result.conversations += 1
        save_dms(session, account, conversation, conversation.messages, result)
    account.last_imported_at = utc_now()
    session.add(account)
    session.commit()
    return result
