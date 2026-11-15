import respx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.domains.accounts.service import upsert_account
from app.domains.content.models import Message, MessageDirection, MessageKind, Post


def mock_zernio_content(mock: respx.MockRouter) -> None:
    mock.get("/accounts/acc-1/posts").respond(
        json={
            "status": "success",
            "posts": [
                {"id": "p1", "platform": "instagram", "message": "Tuto", "commentCount": 2, "createdTime": "2026-11-10T09:00:00Z"},
                {"id": "p2", "platform": "instagram", "message": "Viral"},
            ],
        }
    )
    mock.get("/inbox/comments/p1").respond(
        json={
            "comments": [
                {
                    "id": "c1",
                    "message": "C'est combien ?",
                    "from": {"id": "u1", "username": "lea"},
                    "replies": [{"id": "c1r", "message": "Je t'envoie ça en DM", "from": {"id": "me", "isOwner": True}}],
                }
            ],
            "pagination": {"hasMore": False},
        }
    )
    mock.get("/inbox/comments/p2").respond(500, json={"error": "Instagram is down"})
    mock.post("/posts/sync-external").respond(json={"synced": {"postsFound": 2, "postsSynced": 2, "skipped": False}})
    mock.get("/analytics", params={"postId": "p1"}).respond(
        json={
            "analytics": {"views": 1, "likes": 1, "shares": 1, "reposts": 1},
            "platformAnalytics": [
                {"platformPostId": "p1", "accountId": "acc-1",
                 "analytics": {"views": 1200, "likes": 80, "shares": 7, "reposts": 3, "lastUpdated": "2026-11-15T12:29:30Z"}}
            ],
            "syncStatus": "synced",
        }
    )
    mock.get("/analytics", params={"postId": "p2"}).respond(404, json={"error": "Post not found", "code": "post_not_found"})
    mock.get("/inbox/conversations").respond(
        json={"data": [{"id": "conv-1", "participantName": "lea"}], "pagination": {"hasMore": False}}
    )
    mock.get("/inbox/conversations/conv-1/messages").respond(
        json={
            "messages": [
                {"id": "m1", "message": "Dispo en M ?", "senderId": "u1", "direction": "incoming"},
                {"id": "m2", "message": "Oui !", "senderId": "me", "direction": "outgoing"},
            ],
            "pagination": {"hasMore": False},
        }
    )


def test_import_is_idempotent(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    upsert_account(session, "acc-1", "instagram", "karim", "profile-1")
    mock_zernio_content(zernio_mock)

    first = client.post("/accounts/acc-1/import")
    assert first.status_code == 200
    body = first.json()
    assert (body["posts"], body["comments"], body["conversations"], body["dms"]) == (2, 2, 1, 2)
    assert body["new_messages"] == 4
    assert len(body["errors"]) == 1 and "p2" in body["errors"][0]

    second = client.post("/accounts/acc-1/import").json()
    assert second["new_messages"] == 0

    session.expire_all()
    assert len(session.exec(select(Post)).all()) == 2
    messages = session.exec(select(Message)).all()
    assert len(messages) == 4
    reply = next(m for m in messages if m.external_id == "c1r")
    assert reply.parent_external_id == "c1"
    assert reply.direction == MessageDirection.outgoing
    assert {m.kind for m in messages} == {MessageKind.comment, MessageKind.dm}

    assert body["metrics"] == 1
    posts = client.get("/posts", params={"account_id": "acc-1"}).json()
    p1 = next(p for p in posts if p["external_id"] == "p1")
    assert (p1["view_count"], p1["like_count"], p1["share_count"], p1["repost_count"]) == (1200, 80, 7, 3)
    p2 = next(p for p in posts if p["external_id"] == "p2")
    assert p2["view_count"] is None  # Not available yet: not 0.
    comments = client.get(f"/posts/{p1['id']}/messages").json()
    assert [c["external_id"] for c in comments] == ["c1", "c1r"]


def test_import_unknown_account_returns_404(client: TestClient) -> None:
    assert client.post("/accounts/nope/import").status_code == 404


def test_import_relays_post_list_failure(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    upsert_account(session, "acc-1", "instagram", "karim", "profile-1")
    zernio_mock.get("/accounts/acc-1/posts").respond(401, json={"error": "Token expired", "code": "TOKEN_EXPIRED"})
    response = client.post("/accounts/acc-1/import")
    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_EXPIRED"


def test_demo_load(client: TestClient) -> None:
    first = client.post("/demo/load").json()
    assert first["posts"] == 3
    assert first["comments"] >= 15
    assert first["dms"] >= 3
    assert client.post("/demo/load").json()["new_messages"] == 0
    accounts = client.get("/accounts", params={"sync": False}).json()
    assert accounts[0]["is_demo"] is True
    assert len(client.get("/posts").json()) == 3


def test_demo_posts_have_metrics(client: TestClient) -> None:
    client.post("/demo/load")
    post = next(p for p in client.get("/posts").json() if p["external_id"] == "demo-post-2")
    assert (post["view_count"], post["share_count"], post["repost_count"]) == (48200, 310, 57)
