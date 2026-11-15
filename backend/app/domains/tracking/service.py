"""Tracked links (F8): short link + UTM parameters + redirect, and the DM click-through rate."""

import re
import secrets
from collections import defaultdict
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.domains.accounts.models import utc_now
from app.domains.content.models import Message, Post
from app.domains.outreach.models import DmAttempt, DmStatus
from app.domains.tracking.models import LinkClick, TrackedLink
from app.domains.products.models import Product
from app.domains.tracking.schemas import PostClickStats, ProductClickStats, TrackedLinkRead, TrackingStats

REDIRECT_PATH = "/r"
UTM_MEDIUM = "dm"
UTM_CAMPAIGN = "auto_dm"

# Instagram and Messenger fetch each link in a DM to build a preview: it is not a click.
_BOT_PATTERN = re.compile(
    r"facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|instagram.*preview|"
    r"bot\b|crawler|spider|preview|slurp|curl|python-requests|httpx",
    re.IGNORECASE,
)


def is_bot(user_agent: str | None) -> bool:
    return not user_agent or bool(_BOT_PATTERN.search(user_agent))


def with_utm(url: str, *, source: str, content: str, term: str | None) -> str:
    """Add the UTM parameters. Other query parameters of the landing URL stay."""
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not k.startswith("utm_")]
    utm = {"utm_source": source, "utm_medium": UTM_MEDIUM, "utm_campaign": UTM_CAMPAIGN, "utm_content": content}
    if term:
        utm["utm_term"] = term
    return urlunsplit(parts._replace(query=urlencode(query + list(utm.items()))))


def base_url() -> str:
    settings = get_settings()
    return (settings.tracking_base_url or settings.public_base_url).rstrip("/")


def short_url(code: str) -> str:
    return f"{base_url()}{REDIRECT_PATH}/{code}"


def is_public_base_url() -> bool:
    """A prospect on Instagram cannot open a localhost link."""
    host = urlsplit(base_url()).hostname or ""
    return host not in ("localhost", "127.0.0.1", "0.0.0.0") and not host.endswith(".local")


def dm_url(link: TrackedLink) -> str:
    """The URL to write in the DM: the short link if the API is public, else the UTM landing URL.

    Without a public URL, the UTM parameters still work in the analytics of the landing page,
    but this API cannot count the clicks.
    """
    return short_url(link.code) if is_public_base_url() else link.destination_url


def _new_code(session: Session) -> str:
    while True:
        code = secrets.token_urlsafe(6)  # 8 characters.
        if session.get(TrackedLink, code) is None:
            return code


def link_for_comment(
    session: Session, message: Message, post: Post, landing_url: str, intent: str, product_id: int | None = None
) -> TrackedLink:
    """Get or create the tracked link of a comment. The destination follows the current landing URL."""
    destination = with_utm(landing_url, source=post.platform, content=f"post_{post.external_id}", term=intent)
    assert message.id is not None and post.id is not None
    link = session.exec(select(TrackedLink).where(TrackedLink.message_id == message.id)).first()
    if link is None:
        link = TrackedLink(
            code=_new_code(session),
            account_id=message.account_id,
            post_id=post.id,
            message_id=message.id,
            recipient_id=message.author_id,
            intent=intent,
            destination_url=destination,
        )
    link.destination_url = destination
    link.intent = intent
    link.product_id = product_id
    session.add(link)
    session.commit()
    session.refresh(link)
    return link


def register_hit(session: Session, code: str, user_agent: str | None) -> TrackedLink | None:
    link = session.get(TrackedLink, code)
    if link is None:
        return None
    bot = is_bot(user_agent)
    now = utc_now()
    if bot:
        link.bot_hits += 1
    else:
        link.click_count += 1
        link.first_clicked_at = link.first_clicked_at or now
        link.last_clicked_at = now
    session.add(link)
    session.add(LinkClick(code=code, is_bot=bot, clicked_at=now))
    session.commit()
    session.refresh(link)
    return link


def to_read(link: TrackedLink) -> TrackedLinkRead:
    item = TrackedLinkRead.model_validate(link)
    item.short_url = short_url(link.code)
    return item


def list_links(session: Session, account_id: str | None = None, post_id: int | None = None) -> list[TrackedLink]:
    query = select(TrackedLink)
    if account_id:
        query = query.where(TrackedLink.account_id == account_id)
    if post_id is not None:
        query = query.where(TrackedLink.post_id == post_id)
    return list(session.exec(query.order_by(col(TrackedLink.created_at).desc())))


def _ratio(value: int, total: int) -> float:
    return round(value / total, 4) if total else 0.0


def _group(rows: list[tuple[int | None, int]]) -> tuple[int, int, int]:
    sent = len(rows)
    clicked = sum(1 for _, c in rows if c)
    clicks = sum(c for _, c in rows)
    return sent, clicked, clicks


def stats(session: Session, account_id: str | None = None) -> TrackingStats:
    """Click-through rate of the sent DMs: in total, per post and per product."""
    query = (
        select(DmAttempt.post_id, DmAttempt.product_id, TrackedLink.click_count)
        .join(TrackedLink, col(TrackedLink.message_id) == col(DmAttempt.message_id), isouter=True)
        .where(DmAttempt.status == DmStatus.sent)
    )
    if account_id:
        query = query.where(DmAttempt.account_id == account_id)
    by_post: dict[int, list[tuple[int | None, int]]] = defaultdict(list)
    by_product: dict[int | None, list[tuple[int | None, int]]] = defaultdict(list)
    for post_id, product_id, click_count in session.exec(query):
        by_post[post_id].append((product_id, click_count or 0))
        by_product[product_id].append((product_id, click_count or 0))

    posts = []
    for post_id, rows in by_post.items():
        sent, clicked, clicks = _group(rows)
        posts.append(
            PostClickStats(
                post_id=post_id, dms_sent=sent, links_clicked=clicked, clicks=clicks,
                click_through_rate=_ratio(clicked, sent),
            )
        )
    posts.sort(key=lambda p: (-p.click_through_rate, -p.dms_sent))

    products = []
    for product_id, rows in by_product.items():
        sent, clicked, clicks = _group(rows)
        product = session.get(Product, product_id) if product_id is not None else None
        products.append(
            ProductClickStats(
                product_id=product_id, product_title=product.title if product else None, dms_sent=sent,
                links_clicked=clicked, clicks=clicks, click_through_rate=_ratio(clicked, sent),
            )
        )
    products.sort(key=lambda p: (-p.click_through_rate, -p.dms_sent))

    total_sent = sum(p.dms_sent for p in posts)
    total_clicked = sum(p.links_clicked for p in posts)
    return TrackingStats(
        dms_sent=total_sent,
        links_clicked=total_clicked,
        clicks=sum(p.clicks for p in posts),
        click_through_rate=_ratio(total_clicked, total_sent),
        posts=posts,
        products=products,
    )
