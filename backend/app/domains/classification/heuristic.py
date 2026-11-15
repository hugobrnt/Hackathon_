"""Keyword classifier. It is the fallback if Workers AI is not configured or fails (demo plan B)."""

import re

from app.domains.classification.schemas import ClassificationInput, ClassificationOutput
from app.domains.classification.taxonomy import Intent, Sentiment

HEURISTIC_MODEL = "heuristic"

# The first rule that matches wins: keep the most specific rules first.
_RULES: list[tuple[Intent, Sentiment, re.Pattern[str]]] = [
    (Intent.neutral_spam, Sentiment.neutral, re.compile(r"https?://|bit\.ly|gagne[zr]|crypto|promo code", re.I)),
    (
        Intent.support_complaint,
        Sentiment.negative,
        re.compile(
            r"pas (encore )?(arriv|re[çc]u)|toujours pas|rembours|probl[eè]me|bug|cass[ée]|commande #|"
            r"not (yet )?(arrived|received)|refund|broken|doesn'?t work|ne marche pas",
            re.I,
        ),
    ),
    (
        Intent.objection,
        Sentiment.negative,
        re.compile(r"trop cher|un peu cher|hors de prix|pas confiance|arnaque|too expensive|scam|overpriced", re.I),
    ),
    (
        Intent.purchase_intent,
        Sentiment.positive,
        re.compile(
            r"je (le |la )?prends|je commande|o[uù] (je )?(peux )?command|lien pour command|le lien|lien svp|"
            r"il me (le|la) faut|j'ach[eè]te|take my money|want to buy|where can i (buy|order)|how (do|can) i (buy|order)",
            re.I,
        ),
    ),
    (
        Intent.feature_request,
        Sentiment.neutral,
        re.compile(r"il manque|ce serait (top|bien|cool)|vous pourriez ajouter|en version|please add|would love a", re.I),
    ),
    (
        Intent.pre_purchase_question,
        Sentiment.neutral,
        re.compile(
            r"combien|prix|tarif|dispo|disponible|livr|taille|compatible|paiement|en (xs|s|m|l|xl|xxl)\b|"
            r"how much|price|shipping|size|in stock",
            re.I,
        ),
    ),
    (
        Intent.testimonial,
        Sentiment.positive,
        re.compile(r"depuis \d+ (mois|ans|semaines)|je l'utilise|g[ée]nial|nickel|magnifique|trop beau|love|top|😍|❤", re.I),
    ),
]


def classify_heuristic(item: ClassificationInput) -> ClassificationOutput:
    text = item.text.strip()
    for intent, sentiment, pattern in _RULES:
        if pattern.search(text):
            return ClassificationOutput(
                intent=intent, sentiment=sentiment, confidence=0.55, rationale="keyword rule", model=HEURISTIC_MODEL
            )
    if text.endswith("?"):
        return ClassificationOutput(
            intent=Intent.pre_purchase_question,
            sentiment=Sentiment.neutral,
            confidence=0.4,
            rationale="open question",
            model=HEURISTIC_MODEL,
        )
    return ClassificationOutput(
        intent=Intent.neutral_spam,
        sentiment=Sentiment.neutral,
        confidence=0.5,
        rationale="no business signal",
        model=HEURISTIC_MODEL,
    )
