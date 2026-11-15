"""Insights (F12): group the classified comments and DMs into themes, with real quotes."""

import asyncio
import uuid

from sqlmodel import Session, col, select

from app.domains.accounts.models import SocialAccount, utc_now
from app.domains.classification.models import MessageClassification
from app.domains.content.models import Message, MessageDirection
from app.domains.insights.grouping import GroupItem, ThemeGrouper
from app.domains.insights.models import CATEGORY_INTENTS, InsightCategory, InsightTheme
from app.domains.insights.schemas import CategoryInsights, InsightsReport, InsightsRunRequest, InsightThemeRead

MAX_MESSAGES_PER_CATEGORY = 150
QUOTES_PER_THEME = 3


class InsightsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _messages(
    session: Session, account_id: str, category: InsightCategory, post_id: int | None
) -> list[tuple[Message, float]]:
    """Incoming messages of the category, most confident first."""
    query = (
        select(Message, MessageClassification.confidence)
        .join(MessageClassification, col(MessageClassification.message_id) == col(Message.id))
        .where(
            Message.account_id == account_id,
            Message.direction == MessageDirection.incoming,
            col(Message.author_is_owner).is_(False),
            Message.text != "",
            MessageClassification.intent == CATEGORY_INTENTS[category],
        )
        .order_by(col(MessageClassification.confidence).desc(), col(Message.id).desc())
    )
    if post_id is not None:
        query = query.where(Message.post_id == post_id)
    return [(m, c) for m, c in session.exec(query.limit(MAX_MESSAGES_PER_CATEGORY))]


def _quotes(messages: list[Message]) -> list[str]:
    quotes: list[str] = []
    for message in messages:
        text = " ".join(message.text.split())
        if text and text not in quotes:
            quotes.append(text[:280])
        if len(quotes) == QUOTES_PER_THEME:
            break
    return quotes


def _report(rows: list[InsightTheme], totals: dict[InsightCategory, int], top: int) -> InsightsReport:
    first = rows[0] if rows else None
    categories = []
    for category in InsightCategory:
        themes = sorted(
            (r for r in rows if r.category == category), key=lambda r: r.mention_count, reverse=True
        )[:top]
        categories.append(
            CategoryInsights(
                category=category,
                total_messages=totals.get(category, 0),
                themes=[InsightThemeRead.model_validate(t) for t in themes],
            )
        )
    writers = sorted({r.writer for r in rows if r.writer != "none"})
    return InsightsReport(
        run_id=first.run_id if first else "",
        account_id=first.account_id if first else "",
        post_id=first.post_id if first else None,
        writer=", ".join(writers) or "none",
        generated_at=first.generated_at if first else utc_now(),
        categories=categories,
    )


async def run(session: Session, grouper: ThemeGrouper, request: InsightsRunRequest) -> InsightsReport:
    if session.get(SocialAccount, request.account_id) is None:
        raise InsightsError(404, "Account not found.")
    run_id = uuid.uuid4().hex
    selected = {c: _messages(session, request.account_id, c, request.post_id) for c in InsightCategory}
    totals = {c: len(items) for c, items in selected.items()}

    async def group(category: InsightCategory) -> tuple[InsightCategory, list[InsightTheme]]:
        items = selected[category]
        by_index = {i: m for i, (m, _) in enumerate(items, start=1)}
        result = await grouper.group(
            category, [GroupItem(index=i, text=m.text) for i, m in by_index.items()]
        )
        themes = []
        for theme in result.themes:
            # The indexes follow the confidence order: the first quotes are the clearest ones.
            members = [by_index[i] for i in sorted(theme.indexes) if i in by_index]
            themes.append(
                InsightTheme(
                    run_id=run_id,
                    account_id=request.account_id,
                    post_id=request.post_id,
                    category=category,
                    title=theme.title,
                    summary=theme.summary.strip()[:300],
                    mention_count=len(members),
                    quotes=_quotes(members),
                    message_ids=[m.id for m in members if m.id is not None],
                    post_ids=sorted({m.post_id for m in members if m.post_id is not None}),
                    writer=result.writer,
                )
            )
        return category, themes

    results = await asyncio.gather(*(group(c) for c in InsightCategory))
    rows = [theme for _, themes in results for theme in themes]
    session.add_all(rows)
    session.commit()
    for row in rows:
        session.refresh(row)
    report = _report(rows, totals, request.top)
    report.run_id, report.account_id, report.post_id = run_id, request.account_id, request.post_id
    return report


def latest(session: Session, account_id: str, post_id: int | None = None, top: int = 5) -> InsightsReport:
    query = select(InsightTheme).where(InsightTheme.account_id == account_id)
    query = query.where(InsightTheme.post_id == post_id) if post_id is not None else query.where(
        col(InsightTheme.post_id).is_(None)
    )
    last = session.exec(query.order_by(col(InsightTheme.id).desc())).first()
    if last is None:
        raise InsightsError(404, "No insights yet. Run POST /insights/run first.")
    rows = list(session.exec(select(InsightTheme).where(InsightTheme.run_id == last.run_id)))
    totals = {c: len(_messages(session, account_id, c, post_id)) for c in InsightCategory}
    return _report(rows, totals, top)
