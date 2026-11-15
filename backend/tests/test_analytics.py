from collections.abc import Sequence

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.domains.accounts.service import upsert_account
from app.domains.classification.schemas import ClassificationOutput
from app.domains.classification.service import save_result
from app.domains.classification.taxonomy import Intent, Sentiment
from app.domains.content import repository
from app.domains.content.models import MessageDirection, MessageKind


def add_post(session: Session, external_id: str, intents: Sequence[Intent | None], likes: int = 0) -> int:
    post = repository.upsert_post(
        session, account_id="acc-1", external_id=external_id, platform="instagram", caption=external_id, like_count=likes
    )
    assert post.id is not None
    for index, intent in enumerate(intents):
        message, _ = repository.upsert_message(
            session,
            account_id="acc-1",
            kind=MessageKind.comment,
            external_id=f"{external_id}-{index}",
            text="x",
            post_id=post.id,
        )
        session.flush()
        if intent is not None:
            assert message.id is not None
            save_result(
                session,
                message.id,
                ClassificationOutput(intent=intent, sentiment=Sentiment.neutral, confidence=0.9, model="test"),
            )
    # The owner's reply must not count.
    repository.upsert_message(
        session, account_id="acc-1", kind=MessageKind.comment, external_id=f"{external_id}-owner", text="merci",
        post_id=post.id, author_is_owner=True, direction=MessageDirection.outgoing,
    )
    session.commit()
    return post.id


def seed(session: Session) -> tuple[int, int, int]:
    upsert_account(session, "acc-1", "instagram", "karim", None)
    tutorial = add_post(
        session,
        "tutorial",
        [Intent.purchase_intent, Intent.purchase_intent, Intent.pre_purchase_question, Intent.objection, None],
        likes=100,
    )
    viral = add_post(session, "viral", [Intent.testimonial] * 8 + [Intent.pre_purchase_question, Intent.neutral_spam], likes=5000)
    empty = add_post(session, "empty", [])
    return tutorial, viral, empty


def test_ranking_by_intent_score(client: TestClient, session: Session) -> None:
    tutorial, viral, empty = seed(session)
    stats = client.get("/analytics/posts", params={"account_id": "acc-1"}).json()
    assert [s["post"]["id"] for s in stats] == [tutorial, viral, empty]
    assert [s["rank"] for s in stats] == [1, 2, 3]

    top = stats[0]
    assert (top["total_comments"], top["classified_comments"], top["unclassified_comments"]) == (5, 4, 1)
    assert top["purchase_intent_rate"] == 0.4  # 2 / 5
    assert top["buying_signal_rate"] == 0.6  # 3 / 5
    assert top["intent_score"] == 1.8  # (2×3 + 1×2 + 1×1) / 5
    assert top["intent_counts"]["purchase_intent"] == 2

    assert stats[1]["intent_score"] == 0.2  # (1×2) / 10
    assert stats[2]["intent_score"] == 0.0 and stats[2]["total_comments"] == 0


def test_other_sorts_and_filter(client: TestClient, session: Session) -> None:
    tutorial, viral, _ = seed(session)
    by_likes = client.get("/analytics/posts", params={"sort": "likes"}).json()
    assert by_likes[0]["post"]["id"] == viral
    filtered = client.get("/analytics/posts", params={"min_comments": 6}).json()
    assert [s["post"]["id"] for s in filtered] == [viral]
    assert client.get("/analytics/posts", params={"sort": "bad"}).status_code == 422


def test_post_detail(client: TestClient, session: Session) -> None:
    tutorial, _, _ = seed(session)
    body = client.get(f"/analytics/posts/{tutorial}").json()
    assert body["intent_score"] == 1.8
    assert body["rank"] == 0
    assert len(body["comments"]) == 6  # 5 audience comments + the owner's reply.
    intents = [c["classification"]["intent"] for c in body["key_comments"]]
    assert intents == ["purchase_intent", "purchase_intent", "pre_purchase_question", "objection"]
    assert "post" in body and "view_count" in body["post"]
    assert client.get("/analytics/posts/999").status_code == 404


def test_demo_dataset_ranking(client: TestClient) -> None:
    client.post("/demo/load")
    stats = client.get("/analytics/posts", params={"account_id": "demo-instagram"}).json()
    assert len(stats) == 3
    assert all(s["classified_comments"] == s["total_comments"] for s in stats)
    # The viral video (2310 likes) sells less than the tutorial and the launch post.
    assert stats[-1]["post"]["external_id"] == "demo-post-2"
