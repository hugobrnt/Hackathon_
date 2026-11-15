"""Group similar messages into themes: Workers AI LLM, with a keyword heuristic as fallback."""

import logging
import re
import unicodedata
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from app.core.config import Settings, get_settings
from app.domains.insights.models import InsightCategory
from app.integrations.cloudflare.workers_ai import WorkersAIClient, WorkersAIError

logger = logging.getLogger(__name__)

TEXT_MAX = 200

CATEGORY_HELP: dict[InsightCategory, str] = {
    InsightCategory.objections: "objections: reasons not to buy (price, trust, quality, delivery...)",
    InsightCategory.feature_requests: "feature requests: missing features, variants or products the audience asks for",
    InsightCategory.needs: "pre-purchase questions: what the audience needs to know before it buys",
    InsightCategory.praise: "praise and testimonials: what the audience likes",
}


class GroupItem(BaseModel):
    index: int
    text: str


class Theme(BaseModel):
    title: str = Field(min_length=1)
    summary: str = ""
    indexes: list[int]


class GroupResult(BaseModel):
    themes: list[Theme]
    writer: str


SYSTEM_PROMPT = """You analyse the comments and DMs that a brand receives on social media. You receive \
numbered messages of one category. Group the messages that express the same idea into themes.

Rules:
- A theme = one precise idea (for example "Prix jugé trop élevé" or "Peur que la précommande n'arrive pas"), \
not a vague topic. Two different ideas go in two themes.
- Each message index goes in at most one theme. Ignore a message without a clear idea.
- title: at most 8 words, in the language of the messages (French by default).
- summary: one complete sentence that describes the insight for the founder, in the same language. \
Example: "Plusieurs personnes trouvent le prix trop élevé pour un hoodie." Do not quote a username.
- Use only the indexes that you receive.
Answer with the JSON object only."""

THEMES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "themes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "indexes": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["title", "summary", "indexes"],
            },
        }
    },
    "required": ["themes"],
}


def clean_themes(themes: list[Theme], valid: set[int]) -> list[Theme]:
    """Keep known indexes, one theme per message, and drop the empty themes. Largest first."""
    used: set[int] = set()
    result = []
    for theme in themes:
        indexes = [i for i in dict.fromkeys(theme.indexes) if i in valid and i not in used]
        used.update(indexes)
        if indexes:
            result.append(theme.model_copy(update={"title": theme.title.strip()[:80], "indexes": indexes}))
    return sorted(result, key=lambda t: len(t.indexes), reverse=True)


# Heuristic fallback

_STOPWORDS = set(
    """le la les un une des de du d l et ou a au aux en dans pour par sur avec sans ce cet cette ces mon ma mes ton ta
    tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se y ne pas plus tres
    trop est sont c ca qu que qui quoi quand comment combien vraiment franchement bien tout tous aussi deja encore
    the a an and or of to in on for with is are it this that you i we my your be do does can have has not""".split()
)


def _tokens(text: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return {w for w in re.findall(r"[a-z0-9]+", plain) if len(w) > 2 and w not in _STOPWORDS}


def group_heuristic(items: list[GroupItem]) -> GroupResult:
    """Greedy grouping by shared keywords (Jaccard similarity)."""
    groups: list[tuple[set[str], list[GroupItem]]] = []
    for item in items:
        tokens = _tokens(item.text)
        best, best_score = None, 0.0
        for index, (group_tokens, _) in enumerate(groups):
            union = tokens | group_tokens
            score = len(tokens & group_tokens) / len(union) if union else 0.0
            if score > best_score:
                best, best_score = index, score
        if best is not None and best_score >= 0.25:
            groups[best][0].update(tokens)
            groups[best][1].append(item)
        else:
            groups.append((set(tokens), [item]))
    themes = []
    for _, members in groups:
        shared = set.intersection(*(_tokens(m.text) for m in members)) if len(members) > 1 else _tokens(members[0].text)
        keywords = ", ".join(sorted(shared)[:4]) or members[0].text[:40]
        count = len(members)
        summary = f"{count} message{'s' if count > 1 else ''} sur le même sujet : {keywords}."
        themes.append(Theme(title=members[0].text[:60], summary=summary, indexes=[m.index for m in members]))
    return GroupResult(themes=sorted(themes, key=lambda t: len(t.indexes), reverse=True), writer="heuristic")


class ThemeGrouper(Protocol):
    async def group(self, category: InsightCategory, items: list[GroupItem]) -> GroupResult: ...


class HeuristicGrouper:
    async def group(self, category: InsightCategory, items: list[GroupItem]) -> GroupResult:
        return group_heuristic(items)


class WorkersAIGrouper:
    def __init__(self, settings: Settings, client: WorkersAIClient | None = None) -> None:
        self._settings = settings
        self._client = client or WorkersAIClient(settings)

    async def group(self, category: InsightCategory, items: list[GroupItem]) -> GroupResult:
        if not items:
            return GroupResult(themes=[], writer="none")
        model = self._settings.classifier_large_model
        lines = "\n".join(f"[{item.index}] {' '.join(item.text.split())[:TEXT_MAX]}" for item in items)
        user = f"Category: {CATEGORY_HELP[category]}\n\nMessages:\n{lines}"
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
        try:
            raw = await self._client.run_json(model, messages, THEMES_SCHEMA, max_tokens=1500)
            themes = [Theme.model_validate(t) for t in raw.get("themes", [])]
        except (WorkersAIError, ValidationError) as exc:
            logger.warning("Theme grouping failed: %s", exc)
            return group_heuristic(items)
        cleaned = clean_themes(themes, {item.index for item in items})
        if not cleaned:
            return group_heuristic(items)
        return GroupResult(themes=cleaned, writer=model)


def get_theme_grouper() -> ThemeGrouper:
    """FastAPI dependency. Workers AI if it is configured, else the heuristic."""
    settings = get_settings()
    if settings.cloudflare_account_id and settings.cloudflare_api_token:
        return WorkersAIGrouper(settings)
    return HeuristicGrouper()
