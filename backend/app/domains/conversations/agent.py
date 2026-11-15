"""The LLM that continues a DM conversation (F13). Without LLM, the agent hands off to a human."""

import logging
from typing import Any, Protocol

from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.domains.conversations.schemas import AgentDecision
from app.domains.products.models import BusinessType
from app.integrations.cloudflare.workers_ai import WorkersAIClient, WorkersAIError

logger = logging.getLogger(__name__)

MAX_AGENT_MESSAGE = 600


class AgentProduct(BaseModel):
    title: str
    description: str
    link: str
    business_type: BusinessType


class AgentTurn(BaseModel):
    role: str  # "prospect" or "brand"
    text: str


class AgentInput(BaseModel):
    origin_comment: str
    post_caption: str
    product: AgentProduct | None
    other_products: list[AgentProduct]
    history: list[AgentTurn]


SYSTEM_PROMPT = """You continue a private conversation (Instagram DM) for a brand, after a first automatic message. \
You speak for the brand. Goal: answer the prospect and help them buy or sign up, without pressure.

You receive the comment that started the conversation, the post caption, the main product, the other products \
of the catalog and the history of the conversation (prospect and brand messages).

Choose one action:
- "reply": write the next message of the brand.
- "handoff": a human must answer (complaint, order problem, angry person, request for a human, a question \
that the facts cannot answer, negotiation of a price or a discount).
- "close": the person wants no more messages, or the conversation is finished (for example "merci, c'est bon").

Rules for "reply":
- Language of the prospect (French by default), "tu" in French, 1 to 3 short sentences, at most 1 emoji.
- Use ONLY facts from the product descriptions and the post caption. Never invent a price, a delay, a feature, \
a discount or a stock level.
- If the prospect asks about another product of the catalog, answer about it and give its link.
- Give a link only if it helps, and write it exactly as given.
- Do not repeat the previous brand message.
- reason: at most 12 words, why you chose the action.
Answer with the JSON object only."""

DECISION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["reply", "handoff", "close"]},
        "message": {"type": "string"},
        "reason": {"type": "string"},
    },
    "required": ["action", "message", "reason"],
}


def _product_line(product: AgentProduct) -> str:
    return f"{product.title} ({product.business_type.value}) — link: {product.link}\n  {product.description[:800]}"


def build_user_prompt(item: AgentInput) -> str:
    history = "\n".join(f"{turn.role}: {' '.join(turn.text.split())[:500]}" for turn in item.history[-12:])
    others = "\n".join(f"- {_product_line(p)}" for p in item.other_products) or "- none"
    main = _product_line(item.product) if item.product else "unknown"
    return (
        f"Comment that started the conversation: {item.origin_comment[:500]}\n"
        f"Post caption: {item.post_caption[:500] or 'none'}\n"
        f"Main product: {main}\n"
        f"Other products:\n{others}\n\n"
        f"Conversation:\n{history}"
    )


class ConversationAgent(Protocol):
    async def decide(self, item: AgentInput) -> AgentDecision: ...


class HandoffAgent:
    """Without LLM: never write alone, a human takes over."""

    async def decide(self, item: AgentInput) -> AgentDecision:
        return AgentDecision(action="handoff", reason="No LLM configured.")


class WorkersAIConversationAgent:
    def __init__(self, settings: Settings, client: WorkersAIClient | None = None) -> None:
        self._settings = settings
        self._client = client or WorkersAIClient(settings)

    async def decide(self, item: AgentInput) -> AgentDecision:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": build_user_prompt(item)}]
        try:
            raw = await self._client.run_json(self._settings.classifier_large_model, messages, DECISION_SCHEMA, 400)
            decision = AgentDecision.model_validate(raw)
        except (WorkersAIError, ValueError) as exc:
            logger.warning("Agent decision failed: %s", exc)
            return AgentDecision(action="handoff", reason="The LLM failed.")
        if decision.action not in ("reply", "handoff", "close"):
            return AgentDecision(action="handoff", reason="Unknown action from the LLM.")
        if decision.action == "reply" and not (0 < len(decision.message.strip()) <= MAX_AGENT_MESSAGE):
            return AgentDecision(action="handoff", reason="The LLM message is empty or too long.")
        return decision


def get_conversation_agent() -> ConversationAgent:
    """FastAPI dependency. Workers AI if it is configured, else a human takes over each conversation."""
    settings = get_settings()
    if settings.cloudflare_account_id and settings.cloudflare_api_token:
        return WorkersAIConversationAgent(settings)
    return HandoffAgent()
