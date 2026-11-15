import json
from typing import Any

import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.domains.classification.taxonomy import Intent
from app.domains.conversations.agent import AgentInput, get_conversation_agent
from app.domains.conversations.schemas import AgentDecision
from tests.test_outreach import add_comment, enable, mock_reply, setup_post
from tests.test_webhooks import send


class ScriptedAgent:
    def __init__(self, *decisions: AgentDecision) -> None:
        self.decisions = list(decisions)
        self.inputs: list[AgentInput] = []

    async def decide(self, item: AgentInput) -> AgentDecision:
        self.inputs.append(item)
        return self.decisions.pop(0) if self.decisions else AgentDecision(action="reply", message="Ok !")


def use_agent(client: TestClient, agent: ScriptedAgent) -> None:
    app = client.app
    assert isinstance(app, FastAPI)
    app.dependency_overrides[get_conversation_agent] = lambda: agent


def dm_event(event_id: str, text: str, *, sent: bool = False, mid: str, conv: str = "conv-1",
             sender: str = "anis") -> dict[str, Any]:
    return {
        "id": event_id,
        "event": "message.sent" if sent else "message.received",
        "message": {
            "id": f"z-{mid}", "platformMessageId": mid, "conversationId": conv, "platform": "instagram",
            "direction": "outgoing" if sent else "incoming", "text": text,
            "sender": {"id": "acc-owner" if sent else sender, "username": "marko" if sent else sender},
        },
        "account": {"accountId": "acc-1", "platform": "instagram"},
    }


def start(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> int:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "anis", Intent.purchase_intent)
    zernio_mock.post("/inbox/comments/p1/c1/private-reply").respond(json={"messageId": "mid.1"})
    enable(client, post_id)
    assert client.post(f"/posts/{post_id}/auto-dm/run").json()["sent"] == 1
    conversations = client.get("/conversations").json()
    assert [c["status"] for c in conversations] == ["waiting_reply"]
    conversation_id: int = conversations[0]["id"]
    return conversation_id


def test_full_conversation(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    agent = ScriptedAgent(AgentDecision(action="reply", message="Oui, en S c'est 59 euros !", reason="price"))
    use_agent(client, agent)
    conversation_id = start(client, session, zernio_mock)
    send_route = zernio_mock.post("/inbox/conversations/conv-1/messages").respond(
        json={"success": True, "data": {"messageId": "mid.2", "conversationId": "conv-1"}}
    )

    send(client, dm_event("e1", "Hello anis ! Tu peux commander ici", sent=True, mid="mid.1"))  # Auto-DM echo.
    send(client, dm_event("e2", "C'est combien en S ?", mid="mid.p1"))
    assert send_route.called
    body = json.loads(send_route.calls.last.request.content)
    assert body == {"accountId": "acc-1", "message": "Oui, en S c'est 59 euros !"}
    assert send_route.calls.last.request.headers["Idempotency-Key"]
    assert agent.inputs[0].product is not None and agent.inputs[0].product.title == "Hoodie bio"
    assert [t.role for t in agent.inputs[0].history] == ["brand", "prospect"]

    send(client, dm_event("e3", "Oui, en S c'est 59 euros !", sent=True, mid="mid.2"))  # Echo: no duplicate.
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["status"] == "active" and detail["agent_replies"] == 1
    assert [(m["sent_by"], m["text"]) for m in detail["messages"]] == [
        ("agent", "Hello anis ! Tu peux commander ici"),
        ("prospect", "C'est combien en S ?"),
        ("agent", "Oui, en S c'est 59 euros !"),
    ]
    assert detail["origin_comment"] == "Dispo en M ?"

    send(client, dm_event("e4", "Stop, merci", mid="mid.p2"))
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["status"] == "closed" and send_route.call_count == 1
    assert client.post(f"/conversations/{conversation_id}/resume").status_code == 409


def test_link_by_sender_and_guardrails(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    use_agent(client, ScriptedAgent())
    conversation_id = start(client, session, zernio_mock)
    zernio_mock.post("/inbox/conversations/conv-9/messages").respond(json={"data": {"messageId": "x"}})
    # No `message.sent` echo: the conversation is found by the sender.
    send(client, dm_event("e1", "Je veux parler à un humain", mid="mid.p1", conv="conv-9"))
    summary = client.get("/conversations", params={"status": "handed_off"}).json()[0]
    assert summary["conversation_id"] == "conv-9" and summary["needs_attention"] is True
    assert "human" in summary["handoff_reason"]

    resumed = client.post(f"/conversations/{conversation_id}/resume").json()
    assert resumed["status"] == "active"
    send(client, dm_event("e2", "Et en M ?", mid="mid.p2", conv="conv-9"))
    assert client.get(f"/conversations/{conversation_id}").json()["agent_replies"] == 1

    taken = client.post(f"/conversations/{conversation_id}/handoff").json()
    assert taken["status"] == "handed_off"
    send(client, dm_event("e3", "Et en L ?", mid="mid.p3", conv="conv-9"))
    assert client.get(f"/conversations/{conversation_id}").json()["agent_replies"] == 1  # Agent is silent.


def test_reply_limit(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    use_agent(client, ScriptedAgent())
    conversation_id = start(client, session, zernio_mock)
    zernio_mock.post("/inbox/conversations/conv-1/messages").respond(json={"data": {"messageId": None}})
    for index in range(5):
        send(client, dm_event(f"e{index}", f"Question {index} ?", mid=f"mid.p{index}"))
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["agent_replies"] == 3 and detail["status"] == "handed_off"
    assert "Limit" in detail["handoff_reason"]


def test_unknown_dm_is_ignored_and_404(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    setup_post(session)
    send(client, dm_event("e1", "Hello", mid="mid.x", sender="someone"))
    assert client.get("/conversations").json() == []
    assert client.get("/conversations/999").status_code == 404


def test_inbound_dm_with_buying_signal_gets_an_answer(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    agent = ScriptedAgent(AgentDecision(action="reply", message="Le t-shirt est ici : https://shop.test", reason="link"))
    use_agent(client, agent)
    setup_post(session)
    from tests.test_outreach import add_product

    add_product(client)
    route = zernio_mock.post("/inbox/conversations/conv-in/messages").respond(json={"data": {"messageId": "mid.a1"}})
    send(client, dm_event("e1", "Je prends ! Où je commande ?", mid="mid.in1", conv="conv-in", sender="lea"))
    assert route.called
    conversations = client.get("/conversations").json()
    assert [(c["source"], c["status"], c["agent_replies"], c["post_id"]) for c in conversations] == [
        ("inbound_dm", "active", 1, None)
    ]
    assert agent.inputs[0].product is not None and agent.inputs[0].product.title == "Hoodie bio"
    assert "utm_content=inbound_dm" in agent.inputs[0].product.link
    detail = client.get(f"/conversations/{conversations[0]['id']}").json()
    assert detail["origin_comment"] == "Je prends ! Où je commande ?"
    assert [m["sent_by"] for m in detail["messages"]] == ["prospect", "agent"]

    send(client, dm_event("e2", "stop", mid="mid.in2", conv="conv-in", sender="lea"))
    assert client.get("/conversations").json()[0]["status"] == "closed"
    assert route.call_count == 1


def test_inbound_dm_without_signal_or_catalog_is_ignored(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    use_agent(client, ScriptedAgent())
    setup_post(session)
    route = zernio_mock.post(url__regex=r".*/inbox/conversations/.*/messages").respond(json={"data": {}})
    send(client, dm_event("e1", "Je prends ! Où je commande ?", mid="mid.a", conv="conv-a"))  # Empty catalog.
    from tests.test_outreach import add_product

    add_product(client)
    send(client, dm_event("e2", "🔥🔥", mid="mid.b", conv="conv-b"))  # No buying signal.
    assert client.get("/conversations").json() == [] and not route.called


def test_link_when_zernio_gives_another_thread_id(
    client: TestClient, session: Session, zernio_mock: respx.MockRouter
) -> None:
    use_agent(client, ScriptedAgent(AgentDecision(action="reply", message="Voici le lien !")))
    conversation_id = start(client, session, zernio_mock)
    route = zernio_mock.post("/inbox/conversations/conv-1/messages").respond(json={"data": {"messageId": "mid.2"}})
    send(client, dm_event("e1", "Hello anis", sent=True, mid="mid.1", conv="conv-1"))  # Zernio id.
    send(client, dm_event("e2", "Le lien stp ?", mid="mid.p1", conv="1008123922332735"))  # Participant id.
    assert route.called  # The agent answers in the known thread.
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert [m["sent_by"] for m in detail["messages"]] == ["agent", "prospect", "agent"]
    assert len(client.get("/conversations").json()) == 1  # No second (inbound) conversation.
