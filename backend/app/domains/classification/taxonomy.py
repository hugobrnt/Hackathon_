"""Intent taxonomy of the PRD (section "Taxonomie des intentions")."""

from enum import StrEnum


class Intent(StrEnum):
    purchase_intent = "purchase_intent"  # Intention d'achat forte
    pre_purchase_question = "pre_purchase_question"  # Question pré-achat
    objection = "objection"
    feature_request = "feature_request"  # Demande de feature
    testimonial = "testimonial"  # Témoignage / éloge
    support_complaint = "support_complaint"  # Support / plainte
    neutral_spam = "neutral_spam"  # Neutre / spam


class Sentiment(StrEnum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


# Intents that lead to an automatic DM (F7).
DM_INTENTS = frozenset({Intent.purchase_intent, Intent.pre_purchase_question, Intent.objection})
