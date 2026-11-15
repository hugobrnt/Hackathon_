"""Boost a post as an ad through Zernio (F9).

Guardrails of the PRD: an explicit confirmation, a capped total budget (`ADS_MAX_TOTAL_BUDGET`),
and a campaign created in pause by default. A demo account gets a simulated campaign.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.domains.accounts.models import SocialAccount, utc_now
from app.domains.ads.models import AdBoost, BoostStatus, BudgetType
from app.domains.ads.schemas import AdAccountRead, AdBoostRead, BoostRequest
from app.domains.content.models import Post
from app.integrations.zernio.client import ZernioClient, ZernioError
from app.integrations.zernio.schemas import ZernioAd


class AdsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


LINKED_ACCOUNT_HELP = (
    "Instagram ads need a Facebook Page linked to the Instagram account, and a Meta ad account. "
    "Connect Facebook in Zernio (GET /v1/connect/facebook/ads), then try again."
)


def _explain(exc: ZernioError) -> AdsError:
    if exc.code in ("linked_account_required", "ads_connection_required"):
        return AdsError(422, f"{exc.message} {LINKED_ACCOUNT_HELP}")
    status = exc.status_code if exc.status_code in (400, 401, 403, 404, 409, 422, 429) else 502
    return AdsError(status, f"Zernio: {exc.message}")


def to_read(boost: AdBoost) -> AdBoostRead:
    item = AdBoostRead.model_validate(boost)
    item.is_success = boost.status in (BoostStatus.created, BoostStatus.demo)
    return item


async def list_ad_accounts(zernio: ZernioClient, account_id: str) -> list[AdAccountRead]:
    try:
        accounts = await zernio.list_ad_accounts(account_id)
    except ZernioError as exc:
        raise _explain(exc) from exc
    return [
        AdAccountRead(id=a.id, name=a.name, currency=a.currency, account_status=a.account_status) for a in accounts
    ]


def _apply_ad(boost: AdBoost, ad: ZernioAd) -> None:
    boost.zernio_ad_id = ad.id
    boost.campaign_id = ad.campaign_id or boost.campaign_id
    boost.ad_status = ad.status or ad.configured_status
    boost.review_status = ad.review_status
    boost.updated_at = utc_now()


def _default_name(post: Post) -> str:
    caption = " ".join(post.caption.split())[:40] or post.external_id
    return f"Boost – {caption}"


def build_payload(boost: AdBoost, post: Post, start: datetime) -> dict[str, object]:
    end = start + timedelta(days=boost.duration_days)
    payload: dict[str, object] = {
        "accountId": boost.account_id,
        "adAccountId": boost.ad_account_id,
        # Business-login Meta connections need the platform id; it works for all connections.
        "platformPostId": post.external_id,
        "name": boost.name,
        "goal": boost.goal.value,
        "budgetAmount": boost.budget_amount,
        "budgetType": boost.budget_type.value,
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "status": "PAUSED" if boost.start_paused else "ACTIVE",
    }
    return payload


async def boost_post(session: Session, zernio: ZernioClient, post_id: int, request: BoostRequest) -> AdBoost:
    if not request.confirm:
        raise AdsError(400, "Confirmation required: send `confirm: true` after the user clicks « Confirmer ».")
    cap = get_settings().ads_max_total_budget
    if request.total_budget > cap:
        raise AdsError(
            400, f"Total budget {request.total_budget} is over the cap of {cap} (ADS_MAX_TOTAL_BUDGET)."
        )
    if request.budget_type == BudgetType.daily and request.budget_amount < 1:
        raise AdsError(400, "Meta needs at least 1 per day.")
    post = session.get(Post, post_id)
    if post is None:
        raise AdsError(404, "Post not found.")
    account = session.get(SocialAccount, post.account_id)
    if account is None:
        raise AdsError(404, "Account not found.")

    boost = AdBoost(
        account_id=post.account_id,
        post_id=post_id,
        ad_account_id=request.ad_account_id,
        name=request.name or _default_name(post),
        goal=request.goal,
        budget_amount=request.budget_amount,
        budget_type=request.budget_type,
        duration_days=request.duration_days,
        total_budget=request.total_budget,
        start_paused=request.start_paused,
        status=BoostStatus.requested,
        idempotency_key=str(uuid.uuid4()),
    )
    if account.is_demo:
        # PRD plan B: the demo account has no ad account; show a campaign in review.
        boost.status = BoostStatus.demo
        boost.zernio_ad_id = f"demo-{uuid.uuid4().hex[:10]}"
        boost.ad_status = "PAUSED" if request.start_paused else "PENDING_REVIEW"
        boost.review_status = "pending_review"
        session.add(boost)
        session.commit()
        session.refresh(boost)
        return boost

    # Save before the call: the idempotency key protects a retry from a second campaign.
    session.add(boost)
    session.commit()
    try:
        ad = await zernio.boost_post(build_payload(boost, post, datetime.now(UTC)), boost.idempotency_key)
    except ZernioError as exc:
        error = _explain(exc)
        boost.status = BoostStatus.failed
        boost.error = error.message
        boost.updated_at = utc_now()
        session.add(boost)
        session.commit()
        raise error from exc
    boost.status = BoostStatus.created
    _apply_ad(boost, ad)
    session.add(boost)
    session.commit()
    session.refresh(boost)
    return boost


async def refresh(session: Session, zernio: ZernioClient, boost_id: int) -> AdBoost:
    """Read the delivery and review status of the ad again."""
    boost = session.get(AdBoost, boost_id)
    if boost is None:
        raise AdsError(404, "Boost not found.")
    if boost.status != BoostStatus.created or not boost.zernio_ad_id:
        return boost
    try:
        ad = await zernio.get_ad(boost.zernio_ad_id)
    except ZernioError as exc:
        raise _explain(exc) from exc
    _apply_ad(boost, ad)
    session.add(boost)
    session.commit()
    session.refresh(boost)
    return boost


def list_boosts(session: Session, post_id: int | None = None, account_id: str | None = None) -> list[AdBoost]:
    query = select(AdBoost)
    if post_id is not None:
        query = query.where(AdBoost.post_id == post_id)
    if account_id:
        query = query.where(AdBoost.account_id == account_id)
    return list(session.exec(query.order_by(col(AdBoost.created_at).desc())))
