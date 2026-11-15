"""F14: write 3 post ideas from the insight themes (F12), the catalog and the posts that sell."""

import logging
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from app.core.config import Settings, get_settings
from app.domains.insights.models import InsightCategory, PostFormat
from app.integrations.cloudflare.workers_ai import WorkersAIClient, WorkersAIError

logger = logging.getLogger(__name__)

IDEA_COUNT = 3


class IdeaTheme(BaseModel):
    id: int
    category: InsightCategory
    title: str
    summary: str
    mention_count: int
    quotes: list[str]


class IdeaProduct(BaseModel):
    id: int
    title: str
    description: str
    business_type: str


class IdeaInput(BaseModel):
    themes: list[IdeaTheme]
    products: list[IdeaProduct]
    best_posts: list[str] = Field(description="Captions of the posts with the best Intent Score, best first.")


class IdeaDraft(BaseModel):
    title: str = Field(min_length=1)
    format: PostFormat
    hook: str = Field(min_length=1)
    outline: list[str]
    caption: str = Field(min_length=1)
    call_to_action: str
    rationale: str
    theme_id: int
    product_id: int = 0


class IdeaResult(BaseModel):
    ideas: list[IdeaDraft]
    writer: str


SYSTEM_PROMPT = """You are a content strategist for a founder who sells with Instagram (a SaaS builder or an \
online shop). You write 3 post ideas that answer what the audience says in the comments and DMs.

You receive the insight themes (objections, feature requests, needs before purchase, praise), with their \
number of mentions and real quotes, the product catalog, and the captions of the posts that sell best.

Rules:
- Exactly 3 ideas. Each idea uses a DIFFERENT theme (theme_id) and, if possible, a different category. \
Prefer the themes with the most mentions; prefer objections and needs, because they block sales.
- Each idea:
  - title: precise, at most 8 words.
  - format: reel, carousel, image or story.
  - hook: a complete sentence of 40 to 120 characters that speaks to the reader, often a real quote or a \
strong promise. Not a single word.
  - outline: 3 to 5 concrete steps (slides or scenes). Each step says what is shown or said, with the facts.
  - caption: 2 to 4 sentences, at most 400 characters, with at least one concrete fact from the product \
description (price, delay, guarantee, size...) that answers the insight.
  - call_to_action: short and concrete.
  - rationale: one sentence in natural language: the insight, its number of mentions, and why the post can \
sell. Do not write "theme_id".
- product_id: the product of the catalog that the idea promotes, else 0.
- Language: the language of the quotes (French by default). Use "tu" in French.
- Use ONLY facts from the product descriptions. Never invent a price, a discount, a number or a feature.
- Inspire the format and tone from the posts that sell best.
- Never write a username.
Example of one idea, for another brand (do not copy its words):
{"title": "La gourde passe-t-elle au lave-vaisselle ?", "format": "reel", \
"hook": "« Elle passe au lave-vaisselle ? » On a testé 100 lavages pour toi.", \
"outline": ["La question d'une cliente en commentaire", "Le test : 100 lavages en accéléré", \
"Le résultat : aucune trace, garantie à vie", "Où la trouver"], \
"caption": "Vous êtes nombreux à nous le demander. Réponse : oui, et elle est garantie à vie. 39 €, livraison \
offerte dès 50 €.", "call_to_action": "Commande la tienne, lien en bio", \
"rationale": "4 personnes demandent si la gourde passe au lave-vaisselle : la réponse lève un frein à \
l'achat.", "theme_id": 3, "product_id": 1}

Answer with the JSON object only."""

IDEAS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
            "minItems": IDEA_COUNT,
            "maxItems": IDEA_COUNT,
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "format": {"type": "string", "enum": [f.value for f in PostFormat]},
                    "hook": {"type": "string"},
                    "outline": {"type": "array", "items": {"type": "string"}},
                    "caption": {"type": "string"},
                    "call_to_action": {"type": "string"},
                    "rationale": {"type": "string"},
                    "theme_id": {"type": "integer"},
                    "product_id": {"type": "integer"},
                },
                "required": [
                    "title", "format", "hook", "outline", "caption", "call_to_action", "rationale", "theme_id",
                    "product_id",
                ],
            },
        }
    },
    "required": ["ideas"],
}


def build_user_prompt(item: IdeaInput) -> str:
    themes = "\n".join(
        f"- theme_id {t.id} [{t.category.value}] {t.title} ({t.mention_count} mentions): {t.summary} "
        f"Quotes: {' | '.join(q[:150] for q in t.quotes[:2])}"
        for t in item.themes
    )
    products = "\n".join(
        f"- product_id {p.id}: {p.title} ({p.business_type}) — {' '.join(p.description.split())[:400]}"
        for p in item.products
    ) or "- none"
    posts = "\n".join(f"- {' '.join(c.split())[:200]}" for c in item.best_posts) or "- none"
    return f"Insight themes:\n{themes}\n\nCatalog:\n{products}\n\nPosts that sell best:\n{posts}"


def clean(drafts: list[IdeaDraft], item: IdeaInput) -> list[IdeaDraft]:
    """Keep ideas with a known theme, one idea per theme, a known product (or none), 3 at most."""
    themes = {t.id for t in item.themes}
    products = {p.id for p in item.products}
    used: set[int] = set()
    result = []
    for draft in drafts:
        if draft.theme_id not in themes or draft.theme_id in used:
            continue
        used.add(draft.theme_id)
        outline = [step.strip() for step in draft.outline if step.strip()][:5]
        result.append(
            draft.model_copy(
                update={
                    "hook": draft.hook.strip()[:160],
                    "caption": draft.caption.strip()[:600],
                    "outline": outline,
                    "product_id": draft.product_id if draft.product_id in products else 0,
                }
            )
        )
    return result[:IDEA_COUNT]


_TEMPLATES: dict[InsightCategory, tuple[PostFormat, str, str]] = {
    InsightCategory.objections: (PostFormat.carousel, "On répond à : « {quote} »", "Pose ta question en commentaire"),
    InsightCategory.needs: (PostFormat.reel, "Ta question n°1 : « {quote} »", "Le lien est dans la bio"),
    InsightCategory.feature_requests: (PostFormat.story, "Vous l'avez demandé : {title}", "Vote dans le sondage"),
    InsightCategory.praise: (PostFormat.image, "Ce que vous dites de nous : « {quote} »", "Partage ton avis"),
}


def template_ideas(item: IdeaInput) -> IdeaResult:
    """Fallback without LLM: one simple idea for each of the largest themes."""
    ranked = sorted(item.themes, key=lambda t: t.mention_count, reverse=True)
    ideas = []
    for theme in ranked[:IDEA_COUNT]:
        post_format, hook, cta = _TEMPLATES[theme.category]
        quote = theme.quotes[0][:80] if theme.quotes else theme.title
        ideas.append(
            IdeaDraft(
                title=theme.title,
                format=post_format,
                hook=hook.format(quote=quote, title=theme.title),
                outline=["Le constat : ce que disent les commentaires", "La réponse, avec des faits", "L'appel à l'action"],
                caption=f"{theme.summary} On te répond en détail dans ce post.",
                call_to_action=cta,
                rationale=f"{theme.mention_count} mention(s) sur ce thème : {theme.summary}",
                theme_id=theme.id,
                product_id=item.products[0].id if len(item.products) == 1 else 0,
            )
        )
    return IdeaResult(ideas=ideas, writer="template")


class IdeaWriter(Protocol):
    async def write(self, item: IdeaInput) -> IdeaResult: ...


class TemplateIdeaWriter:
    async def write(self, item: IdeaInput) -> IdeaResult:
        return template_ideas(item)


class WorkersAIIdeaWriter:
    def __init__(self, settings: Settings, client: WorkersAIClient | None = None) -> None:
        self._settings = settings
        self._client = client or WorkersAIClient(settings)

    async def write(self, item: IdeaInput) -> IdeaResult:
        model = self._settings.classifier_large_model
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": build_user_prompt(item)}]
        try:
            raw = await self._client.run_json(model, messages, IDEAS_SCHEMA, max_tokens=1800)
            drafts = [IdeaDraft.model_validate(i) for i in raw.get("ideas", [])]
        except (WorkersAIError, ValidationError) as exc:
            logger.warning("Post ideas failed: %s", exc)
            return template_ideas(item)
        ideas = clean(drafts, item)
        if not ideas:
            return template_ideas(item)
        return IdeaResult(ideas=ideas, writer=model)


def get_idea_writer() -> IdeaWriter:
    """FastAPI dependency. Workers AI if it is configured, else the templates."""
    settings = get_settings()
    if settings.cloudflare_account_id and settings.cloudflare_api_token:
        return WorkersAIIdeaWriter(settings)
    return TemplateIdeaWriter()
