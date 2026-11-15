"""F14: generate and store 3 post ideas from the last insights of an account."""

import uuid

from sqlmodel import Session, col, select

from app.domains.accounts.models import SocialAccount
from app.domains.analytics.schemas import PostSortKey
from app.domains.analytics.service import post_stats
from app.domains.insights import service as insights
from app.domains.insights.grouping import ThemeGrouper
from app.domains.insights.ideas import IdeaInput, IdeaProduct, IdeaTheme, IdeaWriter
from app.domains.insights.models import InsightCategory, PostIdea
from app.domains.insights.schemas import InsightsReport, InsightsRunRequest, PostIdeaRead, PostIdeasRequest, PostIdeasResult
from app.domains.products.service import active_catalog

THEMES_PER_CATEGORY = 5
BEST_POSTS = 3


class IdeasError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def _report(session: Session, grouper: ThemeGrouper, account_id: str) -> InsightsReport:
    """The last insights of the account; run them first if there is none."""
    try:
        return insights.latest(session, account_id, top=THEMES_PER_CATEGORY)
    except insights.InsightsError:
        return await insights.run(session, grouper, InsightsRunRequest(account_id=account_id, top=THEMES_PER_CATEGORY))


def _themes(report: InsightsReport, product_id: int | None) -> list[IdeaTheme]:
    themes = []
    for category in report.categories:
        for theme in category.themes:
            if product_id is not None and not any(c.product_id == product_id for c in theme.comments):
                continue
            themes.append(
                IdeaTheme(
                    id=theme.id,
                    category=category.category,
                    title=theme.title,
                    summary=theme.summary,
                    mention_count=theme.mention_count,
                    quotes=theme.quotes,
                )
            )
    return themes


async def generate(
    session: Session, writer: IdeaWriter, grouper: ThemeGrouper, request: PostIdeasRequest
) -> PostIdeasResult:
    if session.get(SocialAccount, request.account_id) is None:
        raise IdeasError(404, "Account not found.")
    report = await _report(session, grouper, request.account_id)
    themes = _themes(report, request.product_id)
    if not themes:
        raise IdeasError(409, "No insight theme yet: import and classify comments, then try again.")
    catalog = active_catalog(session, request.account_id)
    if request.product_id is not None:
        catalog = [p for p in catalog if p.id == request.product_id]
        if not catalog:
            raise IdeasError(404, "This product is not an active product of the account.")
    best = post_stats(session, account_id=request.account_id, sort=PostSortKey.intent_score, min_comments=1)
    result = await writer.write(
        IdeaInput(
            themes=themes,
            products=[
                IdeaProduct(id=p.id or 0, title=p.title, description=p.description, business_type=p.business_type.value)
                for p in catalog
            ],
            best_posts=[s.post.caption for s in best[:BEST_POSTS] if s.post.caption],
        )
    )
    categories = {t.id: t.category for t in themes}
    generation_id = uuid.uuid4().hex
    rows = [
        PostIdea(
            generation_id=generation_id,
            account_id=request.account_id,
            insights_run_id=report.run_id,
            title=idea.title.strip()[:120],
            format=idea.format,
            hook=idea.hook,
            outline=idea.outline,
            caption=idea.caption,
            call_to_action=idea.call_to_action.strip()[:120],
            rationale=idea.rationale.strip()[:400],
            category=categories.get(idea.theme_id, InsightCategory.needs),
            theme_ids=[idea.theme_id],
            product_id=idea.product_id or (request.product_id if request.product_id is not None else None),
            writer=result.writer,
        )
        for idea in result.ideas
    ]
    session.add_all(rows)
    session.commit()
    for row in rows:
        session.refresh(row)
    return PostIdeasResult(
        generation_id=generation_id,
        account_id=request.account_id,
        insights_run_id=report.run_id,
        ideas=[PostIdeaRead.model_validate(r) for r in rows],
    )


def latest(session: Session, account_id: str) -> PostIdeasResult:
    last = session.exec(
        select(PostIdea).where(PostIdea.account_id == account_id).order_by(col(PostIdea.id).desc())
    ).first()
    if last is None:
        raise IdeasError(404, "No post ideas yet. Generate them with POST /insights/post-ideas.")
    rows = session.exec(select(PostIdea).where(PostIdea.generation_id == last.generation_id).order_by(col(PostIdea.id)))
    return PostIdeasResult(
        generation_id=last.generation_id,
        account_id=account_id,
        insights_run_id=last.insights_run_id,
        ideas=[PostIdeaRead.model_validate(r) for r in rows],
    )
