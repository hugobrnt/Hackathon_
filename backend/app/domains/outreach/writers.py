"""DM text generation: Workers AI, with a template per intent as fallback."""

import logging
from typing import Any, Protocol

from app.core.config import Settings, get_settings
from app.domains.classification.taxonomy import Intent
from app.domains.outreach.schemas import DmDraft, DmDraftInput
from app.domains.products.models import BusinessType
from app.integrations.cloudflare.workers_ai import WorkersAIClient, WorkersAIError

logger = logging.getLogger(__name__)

MAX_DM_LENGTH = 600

COMMON_RULES = """Rules:
- Write in the language of the comment (French by default). Use "tu" in French.
- 2 or 3 short sentences, at most 350 characters. Friendly and human, no hard selling, at most 1 emoji.
- Start with the username of the person if it is given.
- Use ONLY facts from the product description and the post caption. Never invent a price, a feature, \
an integration, a delay, a size or a country.
- If the facts do not mention what the person asks, do not answer yes or no: say that the page has the \
details. Do not deduce that something is missing because it is not in the list.
- Write the link exactly once, as is.
- No sign-off, no opt-out sentence, no hashtag.
Answer with the JSON object only."""

SYSTEM_PROMPTS: dict[BusinessType, str] = {
    BusinessType.saas: """You write the first private message (DM) that the founder of a SaaS sends to a person \
who commented on a post. Goal: help the person and bring them to the landing page (sign-up, free trial or demo).

You receive the SaaS name, the description of what the SaaS offers (written by the founder), the post caption, \
the comment, its intent and the landing page link.

By intent:
- purchase_intent: thank the person, name the SaaS, invite them to start (free trial or sign-up if the \
description mentions it) with the link.
- pre_purchase_question: answer the question (feature, integration, price, plan) with the facts if they exist. \
If the answer is not in the facts, say that the landing page has the details. Then give the link.
- objection: acknowledge the concern with empathy, answer with one relevant fact (benefit, price, free trial, \
security) if it exists, then give the link. Never argue.
- Never talk about delivery, sizes or orders: it is software.

""" + COMMON_RULES,
    BusinessType.ecommerce: """You write the first private message (Instagram DM) that an online shop sends to a \
person who commented on its post. Goal: help the person and bring them to the product page to order.

You receive the product name, the product description written by the shop (price, sizes, delivery, returns...), \
the post caption, the comment, its intent and the product page link.

By intent:
- purchase_intent: thank the person, name the product, give the link to order.
- pre_purchase_question: answer the question (price, size, stock, delivery, payment) with the facts if they \
exist. If the answer is not in the facts, say that the page has the details. Then give the link.
- objection: acknowledge the concern with empathy, answer with one relevant fact (quality, price, returns, \
guarantee) if it exists, then give the link. Never argue.

""" + COMMON_RULES,
}

DM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"message": {"type": "string"}},
    "required": ["message"],
}

# Fallback texts if the LLM fails. `{hello}` is "Hello <name> !", `{product}` is the product name.
TEMPLATES: dict[BusinessType, dict[Intent, str]] = {
    BusinessType.saas: {
        Intent.purchase_intent: "{hello} Merci pour ton intérêt pour {product} 🙌 Tu peux démarrer ici : {link}",
        Intent.pre_purchase_question: "{hello} Merci pour ta question. Tout est expliqué sur la page de {product} : {link}",
        Intent.objection: "{hello} Merci pour ton retour, c'est une vraie question. Tu trouveras tous les détails sur {product} ici : {link}",
    },
    BusinessType.ecommerce: {
        Intent.purchase_intent: "{hello} Merci pour ton message 🙌 Tu peux commander {product} ici : {link}",
        Intent.pre_purchase_question: "{hello} Merci pour ta question. Toutes les infos sur {product} sont ici : {link}",
        Intent.objection: "{hello} Merci pour ton retour, on comprend tout à fait. Tous les détails sur {product} sont ici : {link}",
    },
}


class DmWriter(Protocol):
    async def write(self, item: DmDraftInput) -> DmDraft: ...


def template_draft(item: DmDraftInput) -> DmDraft:
    templates = TEMPLATES[item.business_type]
    template = templates.get(item.intent, templates[Intent.pre_purchase_question])
    hello = f"Hello {item.author_name} !" if item.author_name else "Hello !"
    text = template.format(hello=hello, product=item.product_name, link=item.landing_url)
    return DmDraft(text=text, writer="template")


class TemplateDmWriter:
    async def write(self, item: DmDraftInput) -> DmDraft:
        return template_draft(item)


class WorkersAIDmWriter:
    def __init__(self, settings: Settings, client: WorkersAIClient | None = None) -> None:
        self._settings = settings
        self._client = client or WorkersAIClient(settings)

    async def write(self, item: DmDraftInput) -> DmDraft:
        user = (
            f"Intent: {item.intent.value}\n"
            f"Person: {item.author_name or 'unknown'}\n"
            f"Comment: {item.comment.strip()[:500]}\n"
            f"Profile: {item.business_type.value}\n"
            f"Product name: {item.product_name}\n"
            f"Product description: {item.product_description.strip()[:2000]}\n"
            f"Post caption: {item.post_caption.strip()[:600] or 'unknown'}\n"
            f"Link: {item.landing_url}"
        )
        system = SYSTEM_PROMPTS[item.business_type]
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        model = self._settings.classifier_large_model
        try:
            raw = await self._client.run_json(model, messages, DM_SCHEMA, max_tokens=300)
            text = str(raw.get("message", "")).strip()
        except WorkersAIError as exc:
            logger.warning("DM generation failed: %s", exc)
            return template_draft(item)
        if not text or len(text) > MAX_DM_LENGTH or item.landing_url not in text:
            # A DM without the link, or too long, is not usable: use the template.
            return template_draft(item)
        return DmDraft(text=text, writer=model)


def get_dm_writer() -> DmWriter:
    """FastAPI dependency. Workers AI if it is configured, else the templates."""
    settings = get_settings()
    if settings.cloudflare_account_id and settings.cloudflare_api_token:
        return WorkersAIDmWriter(settings)
    return TemplateDmWriter()
