"""Purchase Intent Rate and Intent Score per post (F4).

The values are computed from the stored classifications at each request, so they
are always up to date and cover 100 % of the imported posts.
"""

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime

from sqlmodel import Session, col, select

from app.domains.analytics.schemas import PostDetail, PostIntentStats, PostSortKey
from app.domains.classification.schemas import ClassificationRead
from app.domains.classification.service import get_for_messages
from app.domains.content import repository
from app.domains.classification.models import MessageClassification
from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content.models import Message, MessageDirection, MessageKind, Post
from app.domains.content.schemas import MessageRead, PostRead

INTENT_WEIGHTS: dict[Intent, int] = {
    Intent.purchase_intent: 3,
    Intent.pre_purchase_question: 2,
    Intent.objection: 1,
}


class _Counter:
    def __init__(self) -> None:
        self.total = 0
        self.classified = 0
        self.review = 0
        self.intents: dict[Intent, int] = {i: 0 for i in Intent}
        self.sentiments: dict[Sentiment, int] = {s: 0 for s in Sentiment}


def _ratio(value: float, total: int) -> float:
    return round(value / total, 4) if total else 0.0


def _build(post: Post, counter: _Counter) -> PostIntentStats:
    intents = counter.intents
    total = counter.total
    weighted = sum(intents[intent] * weight for intent, weight in INTENT_WEIGHTS.items())
    return PostIntentStats(
        post=PostRead.model_validate(post),
        total_comments=total,
        classified_comments=counter.classified,
        unclassified_comments=total - counter.classified,
        intent_counts=intents,
        sentiment_counts=counter.sentiments,
        purchase_intent_rate=_ratio(intents[Intent.purchase_intent], total),
        buying_signal_rate=_ratio(intents[Intent.purchase_intent] + intents[Intent.pre_purchase_question], total),
        intent_score=_ratio(weighted, total),
        needs_review=counter.review,
        rank=0,
    )


_EPOCH = datetime.min.replace(tzinfo=UTC)

_SORT_KEYS: dict[PostSortKey, Callable[[PostIntentStats], tuple[float, ...]]] = {
    # Ties: more purchase intents first, then more comments.
    PostSortKey.intent_score: lambda s: (s.intent_score, s.intent_counts[Intent.purchase_intent], s.total_comments),
    PostSortKey.purchase_intent_rate: lambda s: (
        s.purchase_intent_rate,
        s.intent_counts[Intent.purchase_intent],
        s.total_comments,
    ),
    PostSortKey.buying_signal_rate: lambda s: (s.buying_signal_rate, s.intent_score, s.total_comments),
    PostSortKey.comments: lambda s: (s.total_comments, s.intent_score),
    PostSortKey.likes: lambda s: (s.post.like_count, s.intent_score),
    PostSortKey.views: lambda s: (s.post.view_count or 0, s.intent_score),
    PostSortKey.shares: lambda s: (s.post.share_count or 0, s.intent_score),
    PostSortKey.recent: lambda s: ((s.post.created_time or _EPOCH).replace(tzinfo=UTC).timestamp(),),
}


def post_stats(
    session: Session,
    account_id: str | None = None,
    post_id: int | None = None,
    sort: PostSortKey = PostSortKey.intent_score,
    min_comments: int = 0,
) -> list[PostIntentStats]:
    post_query = select(Post)
    if account_id:
        post_query = post_query.where(Post.account_id == account_id)
    if post_id is not None:
        post_query = post_query.where(Post.id == post_id)
    posts = list(session.exec(post_query))
    if not posts:
        return []

    rows = session.exec(
        select(Message.post_id, MessageClassification.intent, MessageClassification.sentiment, MessageClassification.needs_review)
        .join(MessageClassification, col(MessageClassification.message_id) == col(Message.id), isouter=True)
        .where(
            col(Message.post_id).in_([p.id for p in posts]),
            Message.kind == MessageKind.comment,
            Message.direction == MessageDirection.incoming,
            col(Message.author_is_owner).is_(False),
        )
    )
    counters: dict[int, _Counter] = defaultdict(_Counter)
    for message_post_id, intent, sentiment, review in rows:
        if message_post_id is None:
            continue
        counter = counters[message_post_id]
        counter.total += 1
        if intent is not None:
            counter.classified += 1
            counter.intents[Intent(intent)] += 1
            counter.sentiments[Sentiment(sentiment)] += 1
            counter.review += int(bool(review))

    stats = [_build(p, counters[p.id]) for p in posts if p.id is not None]
    stats = [s for s in stats if s.total_comments >= min_comments]
    stats.sort(key=_SORT_KEYS[sort], reverse=True)
    for index, item in enumerate(stats, start=1):
        item.rank = index
    return stats


# Order of the key comments: the strongest business signal first.
KEY_INTENT_PRIORITY: dict[Intent, int] = {
    Intent.purchase_intent: 0,
    Intent.pre_purchase_question: 1,
    Intent.objection: 2,
    Intent.support_complaint: 3,
}
KEY_COMMENTS_LIMIT = 5


def messages_with_classification(session: Session, messages: list[Message]) -> list[MessageRead]:
    classifications = get_for_messages(session, [m.id for m in messages if m.id is not None])
    result = []
    for message in messages:
        item = MessageRead.model_validate(message)
        row = classifications.get(message.id) if message.id is not None else None
        if row is not None:
            item.classification = ClassificationRead.model_validate(row)
        result.append(item)
    return result


def select_key_comments(comments: list[MessageRead]) -> list[MessageRead]:
    candidates = [
        c
        for c in comments
        if c.classification is not None
        and c.classification.intent in KEY_INTENT_PRIORITY
        and not c.author_is_owner
    ]
    candidates.sort(
        key=lambda c: (KEY_INTENT_PRIORITY[c.classification.intent], -c.classification.confidence)  # type: ignore[union-attr]
    )
    return candidates[:KEY_COMMENTS_LIMIT]


def post_detail(session: Session, post_id: int) -> PostDetail | None:
    stats = post_stats(session, post_id=post_id)
    if not stats:
        return None
    comments = messages_with_classification(session, repository.list_post_messages(session, post_id))
    data = stats[0].model_dump()
    data["rank"] = 0  # The rank has no meaning for one post.
    return PostDetail(**data, key_comments=select_key_comments(comments), comments=comments)
