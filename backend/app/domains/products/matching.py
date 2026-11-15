"""F7 ter: find the product of the catalog that a comment or a DM reacts to.

Inputs: the post caption, the comment and the active catalog of the account. Short cuts without LLM:
empty catalog → no product; one product → this product; product forced on the post → this product.
"""

import logging
import re
import unicodedata
from collections.abc import Sequence
from typing import Any, Protocol

from pydantic import BaseModel, Field
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import Intent
from app.domains.content.models import Message, Post
from app.domains.outreach.models import PostAutoDm
from app.domains.products.models import Product
from app.domains.products.service import active_catalog
from app.integrations.cloudflare.workers_ai import WorkersAIClient, WorkersAIError

logger = logging.getLogger(__name__)

# Intents where the product matters: DMs (purchase, question, objection) and insights (features, praise).
PRODUCT_INTENTS = frozenset(
    {
        Intent.purchase_intent,
        Intent.pre_purchase_question,
        Intent.objection,
        Intent.feature_request,
        Intent.testimonial,
    }
)


class CatalogItem(BaseModel):
    id: int
    title: str
    description: str


class MatchInput(BaseModel):
    comment: str
    post_caption: str
    catalog: list[CatalogItem]


class MatchResult(BaseModel):
    product_id: int | None
    confidence: float = Field(ge=0, le=1)
    reason: str = ""


class ProductMatcher(Protocol):
    async def match(self, item: MatchInput) -> MatchResult: ...


# Heuristic

_STOPWORDS = set(
    """le la les un une des de du et ou a au aux en dans pour par sur avec sans ce cette ces mon ma mes ton ta tes
    son sa ses notre nos votre vos je tu il elle on nous vous ils me te se ne pas plus est sont qui que quoi
    the and or of to in on for with is are it this that you""".split()
)


def _tokens(text: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return {w for w in re.findall(r"[a-z0-9]+", plain) if len(w) > 2 and w not in _STOPWORDS}


def match_heuristic(item: MatchInput) -> MatchResult:
    comment, caption = _tokens(item.comment), _tokens(item.post_caption)
    best: tuple[float, CatalogItem] | None = None
    for product in item.catalog:
        words = _tokens(f"{product.title} {product.title} {product.description}")
        score = 2 * len(comment & words) + len(caption & words)
        if score > 0 and (best is None or score > best[0]):
            best = (score, product)
    if best is None:
        return MatchResult(product_id=None, confidence=0.0, reason="no shared keyword")
    return MatchResult(product_id=best[1].id, confidence=0.5, reason="keyword match")


class HeuristicProductMatcher:
    async def match(self, item: MatchInput) -> MatchResult:
        return match_heuristic(item)


# LLM

SYSTEM_PROMPT = """You find which product of a brand catalog a social media comment is about.

You receive the post caption, the comment and the catalog (id, title, description).
Rules:
- If the comment names or describes a product of the catalog (title, variant, color, feature...), choose it.
- Else, choose the product that the post is about (from the caption).
- If no product fits, answer product_id 0.
- confidence: your probability (0 to 1) that the choice is right.
- reason: at most 12 words.
Answer with the JSON object only."""

MATCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "product_id": {"type": "integer"},
        "confidence": {"type": "number"},
        "reason": {"type": "string"},
    },
    "required": ["product_id", "confidence", "reason"],
}


def build_user_prompt(item: MatchInput) -> str:
    catalog = "\n".join(f"- id {p.id}: {p.title} — {' '.join(p.description.split())[:300]}" for p in item.catalog)
    return (
        f"Post caption: {item.post_caption.strip()[:600] or 'none'}\n"
        f"Comment: {item.comment.strip()[:500]}\n\n"
        f"Catalog:\n{catalog}"
    )


class WorkersAIProductMatcher:
    def __init__(self, settings: Settings, client: WorkersAIClient | None = None) -> None:
        self._settings = settings
        self._client = client or WorkersAIClient(settings)

    async def match(self, item: MatchInput) -> MatchResult:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": build_user_prompt(item)}]
        try:
            raw = await self._client.run_json(self._settings.classifier_large_model, messages, MATCH_SCHEMA)
            product_id = int(raw.get("product_id") or 0)
            confidence = min(1.0, max(0.0, float(raw.get("confidence") or 0.0)))
        except (WorkersAIError, ValueError, TypeError) as exc:
            logger.warning("Product matching failed: %s", exc)
            return match_heuristic(item)
        valid = {p.id for p in item.catalog}
        if product_id not in valid:
            return MatchResult(product_id=None, confidence=confidence, reason=str(raw.get("reason", ""))[:200])
        return MatchResult(product_id=product_id, confidence=confidence, reason=str(raw.get("reason", ""))[:200])


def get_product_matcher() -> ProductMatcher:
    """FastAPI dependency. Workers AI if it is configured, else the heuristic."""
    settings = get_settings()
    if settings.cloudflare_account_id and settings.cloudflare_api_token:
        return WorkersAIProductMatcher(settings)
    return HeuristicProductMatcher()


# Pipeline


def _save(row: MessageClassification, result: MatchResult) -> None:
    row.product_id = result.product_id
    row.product_confidence = round(result.confidence, 3)
    row.product_reason = result.reason


async def match_messages(session: Session, matcher: ProductMatcher, messages: Sequence[Message]) -> int:
    """Find the product of each classified message. Returns the number of messages with a product."""
    catalogs: dict[str, list[Product]] = {}
    matched = 0
    for message in messages:
        if message.id is None:
            continue
        row = session.get(MessageClassification, message.id)
        if row is None or row.intent not in PRODUCT_INTENTS:
            continue
        catalog = catalogs.setdefault(message.account_id, active_catalog(session, message.account_id))
        post = session.get(Post, message.post_id) if message.post_id is not None else None
        rule = session.get(PostAutoDm, message.post_id) if message.post_id is not None else None
        forced = rule.product_id if rule is not None else None
        if not catalog:
            result = MatchResult(product_id=None, confidence=0.0, reason="empty catalog")
        elif forced is not None and any(p.id == forced for p in catalog):
            result = MatchResult(product_id=forced, confidence=1.0, reason="product forced on the post")
        elif len(catalog) == 1:
            result = MatchResult(product_id=catalog[0].id, confidence=1.0, reason="only product of the catalog")
        else:
            result = await matcher.match(
                MatchInput(
                    comment=message.text,
                    post_caption=post.caption if post else "",
                    catalog=[CatalogItem(id=p.id or 0, title=p.title, description=p.description) for p in catalog],
                )
            )
        _save(row, result)
        session.add(row)
        matched += int(result.product_id is not None)
    session.commit()
    return matched
