from fastapi.testclient import TestClient
from sqlmodel import Session
import respx
from tests.test_outreach import setup_post, add_comment, enable, mock_reply
from app.domains.classification.taxonomy import Intent


def test_preferences_persist_and_escalation_overrides_automatic_mode(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    post = setup_post(session)
    add_comment(session, post, "c1", "author", Intent.pre_purchase_question)
    enable(client, post, require_approval=False)
    reply = mock_reply(zernio_mock)
    payload = {
        "tone": "professional",
        "goal": "trial",
        "escalation_topics": "refund, DISPO",
    }
    assert client.put("/accounts/acc-1/reply-settings", json=payload).status_code == 200
    saved = client.get("/accounts/acc-1/reply-settings").json()
    assert all(saved[k] == v for k, v in payload.items())
    result = client.post(f"/posts/{post}/auto-dm/run").json()
    assert result["pending_approval"] == 1 and result["sent"] == 0 and not reply.called
    attempt = result["attempts"][0]
    assert (
        "human" in attempt["reason"]
        and "Bonjour" in attempt["text"]
        and "essai" in attempt["text"]
    )
    assert (
        client.put(
            "/accounts/acc-1/reply-settings", json={"tone": "invalid"}
        ).status_code
        == 422
    )
    assert client.get("/accounts/missing/reply-settings").status_code == 404
