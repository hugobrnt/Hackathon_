"""Few-shot prompt and JSON schema for the LLM classifier."""

from typing import Any

from app.domains.classification.schemas import ClassificationInput
from app.domains.classification.taxonomy import Intent, Sentiment

SYSTEM_PROMPT = """You classify social media comments and direct messages sent to a brand \
(SaaS or e-commerce). Messages can be in French, English or mixed, with emojis and irony.

Choose exactly one intent:
- purchase_intent: the person wants to buy now. "Je prends, où je commande ?", "Il me le faut en S", "Lien svp ?"
- pre_purchase_question: a question before a purchase (price, size, stock, delivery, compatibility, payment). \
"C'est combien ?", "Dispo en M ?", "Compatible Shopify ?", "Paiement en 3 fois ?"
- objection: a reason not to buy (price, trust, doubt). "Trop cher", "Pas confiance", "Ça a l'air fragile"
- feature_request: asks for a missing feature or variant. "Il manque l'export CSV", "La même en zippé ce serait top"
- testimonial: praise or experience from a user or fan. "Je l'utilise depuis 3 mois, top", "Trop beau 😍"
- support_complaint: a problem with an order or the product. "Ma commande n'est pas arrivée", "Le login bug"
- neutral_spam: no business signal, emoji only, tags of friends, unrelated, or spam links. "🔥", "@julie", "Gagnez 1000€ 👉 bit.ly"

Rules:
- A question about price, size, stock or delivery is pre_purchase_question, also if it is short.
- Explicit wish to buy or to get the link is purchase_intent.
- Praise without a purchase signal is testimonial. Emoji only is neutral_spam.
- Sentiment is the tone of the message: positive, neutral or negative.
- confidence is your probability (0 to 1) that the intent is correct. Use < 0.7 if the message is ambiguous, \
ironic, or too short to decide.
- rationale: at most 15 words, in the language of the message.
Answer with the JSON object only."""

CLASSIFICATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": [i.value for i in Intent]},
        "sentiment": {"type": "string", "enum": [s.value for s in Sentiment]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "rationale": {"type": "string"},
    },
    "required": ["intent", "sentiment", "confidence", "rationale"],
}


def build_messages(item: ClassificationInput) -> list[dict[str, str]]:
    channel = "direct message" if item.kind == "dm" else ("reply to a comment" if item.is_reply else "comment")
    context = (item.post_caption or "").strip().replace("\n", " ")[:300]
    user = (
        f"Channel: {channel}\n"
        f"Post caption (context): {context or 'unknown'}\n"
        f"Message: {item.text.strip()[:1000]}"
    )
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
