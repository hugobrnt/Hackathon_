import json

import respx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import Settings
from app.domains.classification.schemas import ClassificationOutput
from app.domains.classification.service import save_result
from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content import repository
from app.domains.content.models import MessageKind
from app.domains.insights.grouping import GroupItem, WorkersAIGrouper, group_heuristic
from app.domains.insights.models import InsightCategory
from tests.test_outreach import setup_post


def add(session: Session, post_id: int, ext: str, text: str, intent: Intent, confidence: float = 0.9) -> None:
    message, _ = repository.upsert_message(
        session, account_id="acc-1", kind=MessageKind.comment, external_id=ext, text=text, post_id=post_id,
        author_id=f"user-{ext}", author_name=f"user-{ext}",
    )
    session.flush()
    assert message.id is not None
    save_result(session, message.id, ClassificationOutput(intent=intent, sentiment=Sentiment.neutral, confidence=confidence, model="t"))
    session.commit()


def seed(session: Session) -> int:
    post_id = setup_post(session)
    add(session, post_id, "o1", "Trop cher pour un hoodie", Intent.objection, 0.95)
    add(session, post_id, "o2", "Hoodie trop cher pour moi", Intent.objection, 0.8)
    add(session, post_id, "o3", "Pas confiance dans les précommandes", Intent.objection)
    add(session, post_id, "f1", "Il manque une version zippée", Intent.feature_request)
    add(session, post_id, "p1", "Top qualité", Intent.testimonial)
    return post_id


def test_run_and_read(client: TestClient, session: Session) -> None:
    seed(session)
    response = client.post("/insights/run", json={"account_id": "acc-1"})
    assert response.status_code == 200, response.text
    report = response.json()
    objections = next(c for c in report["categories"] if c["category"] == "objections")
    assert objections["total_messages"] == 3
    top = objections["themes"][0]
    assert top["mention_count"] == 2
    assert top["quotes"] == ["Trop cher pour un hoodie", "Hoodie trop cher pour moi"]  # Most confident first.
    assert "user-o1" not in json.dumps(report)  # No usernames.
    assert [c["category"] for c in report["categories"]] == ["objections", "feature_requests", "needs", "praise"]

    latest = client.get("/insights", params={"account_id": "acc-1", "top": 1}).json()
    assert latest["run_id"] == report["run_id"]
    assert len(next(c for c in latest["categories"] if c["category"] == "objections")["themes"]) == 1


def test_errors(client: TestClient, session: Session) -> None:
    setup_post(session)
    assert client.post("/insights/run", json={"account_id": "nope"}).status_code == 404
    assert client.get("/insights", params={"account_id": "acc-1"}).status_code == 404


def test_heuristic_grouping() -> None:
    items = [GroupItem(index=1, text="Trop cher le hoodie"), GroupItem(index=2, text="Le hoodie est cher"),
             GroupItem(index=3, text="Livraison en Belgique ?")]
    result = group_heuristic(items)
    assert [sorted(t.indexes) for t in result.themes] == [[1, 2], [3]]


async def test_llm_grouping_is_cleaned(settings: Settings) -> None:
    s = settings.model_copy(update={"cloudflare_account_id": "cf", "cloudflare_api_token": "t"})
    items = [GroupItem(index=i, text=t) for i, t in [(1, "Trop cher"), (2, "Hors de prix"), (3, "Pas confiance")]]
    themes = {"themes": [
        {"title": "Confiance", "summary": "s", "indexes": [3, 99]},  # 99 is unknown.
        {"title": "Prix trop élevé", "summary": "s", "indexes": [1, 2, 3]},  # 3 is already used.
        {"title": "Vide", "summary": "s", "indexes": []},
    ]}
    with respx.mock() as mock:
        route = mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": themes}}
        )
        result = await WorkersAIGrouper(s).group(InsightCategory.objections, items)
    assert "[2] Hors de prix" in json.loads(route.calls.last.request.content)["messages"][1]["content"]
    assert [(t.title, t.indexes) for t in result.themes] == [("Prix trop élevé", [1, 2]), ("Confiance", [3])]
