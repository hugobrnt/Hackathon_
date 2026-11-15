import json

import respx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import Settings
from app.domains.insights.ideas import IdeaInput, IdeaProduct, IdeaTheme, WorkersAIIdeaWriter
from app.domains.insights.models import InsightCategory
from tests.test_insights import seed
from tests.test_outreach import add_product, setup_post


def test_generate_runs_insights_first(client: TestClient, session: Session) -> None:
    seed(session)
    product_id = add_product(client)
    response = client.post("/insights/post-ideas", json={"account_id": "acc-1"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["insights_run_id"]  # The insights ran first.
    ideas = body["ideas"]
    assert len(ideas) == 3
    assert len({i["theme_ids"][0] for i in ideas}) == 3  # One theme per idea.
    assert ideas[0]["category"] == "objections"  # The largest theme first (2 mentions).
    assert all(i["product_id"] == product_id for i in ideas)  # Only one product in the catalog.
    assert all(i["hook"] and i["caption"] and i["outline"] for i in ideas)

    latest = client.get("/insights/post-ideas", params={"account_id": "acc-1"}).json()
    assert latest["generation_id"] == body["generation_id"]


def test_errors(client: TestClient, session: Session) -> None:
    setup_post(session)
    assert client.post("/insights/post-ideas", json={"account_id": "nope"}).status_code == 404
    assert client.post("/insights/post-ideas", json={"account_id": "acc-1"}).status_code == 409  # No theme.
    assert client.get("/insights/post-ideas", params={"account_id": "acc-1"}).status_code == 404


async def test_llm_output_is_cleaned(settings: Settings) -> None:
    s = settings.model_copy(update={"cloudflare_account_id": "cf", "cloudflare_api_token": "t"})
    item = IdeaInput(
        themes=[
            IdeaTheme(id=1, category=InsightCategory.objections, title="Prix", summary="Trop cher.", mention_count=4, quotes=["Trop cher"]),
            IdeaTheme(id=2, category=InsightCategory.needs, title="Tailles", summary="Quelle taille ?", mention_count=3, quotes=["Dispo en M ?"]),
        ],
        products=[IdeaProduct(id=9, title="Hoodie", description="59 euros", business_type="ecommerce")],
        best_posts=["Tuto taille"],
    )
    idea = {"title": "T", "format": "reel", "hook": "H", "outline": ["a", " ", "b"], "caption": "C",
            "call_to_action": "CTA", "rationale": "R", "theme_id": 1, "product_id": 9}
    ideas = [idea, {**idea, "theme_id": 1}, {**idea, "theme_id": 99}, {**idea, "theme_id": 2, "product_id": 42}]
    with respx.mock() as mock:
        route = mock.post(url__startswith="https://api.cloudflare.com/").respond(
            json={"success": True, "result": {"response": {"ideas": ideas}}}
        )
        result = await WorkersAIIdeaWriter(s).write(item)
    prompt = json.loads(route.calls.last.request.content)["messages"][1]["content"]
    assert "theme_id 1 [objections] Prix (4 mentions)" in prompt and "product_id 9: Hoodie" in prompt
    assert [(i.theme_id, i.product_id, i.outline) for i in result.ideas] == [(1, 9, ["a", "b"]), (2, 0, ["a", "b"])]
