"""Consistent reply behavior for initial outreach and conversation follow-ups."""

TONES: dict[str, str] = {
    "friendly": "Friendly, warm and brief.",
    "professional": "Warm, courteous and professional. No emoji. Use vous in French.",
    "concise": "One or two concise sentences, no emoji.",
}
GOALS: dict[str, str] = {
    "trial": "Guide toward a trial only if the product facts offer one.",
    "demo": "Guide toward a demo only if the product facts offer one.",
    "product_visit": "Guide toward learning about the product on its page.",
}


def reply_instructions(tone: str, goal: str) -> str:
    return "Reply style: " + TONES.get(tone, TONES["professional"]) + "\nGoal: " + GOALS.get(goal, GOALS["product_visit"])


def requires_human(text: str, topics: str) -> bool:
    return any(term.strip().casefold() in text.casefold() for term in topics.split(",") if term.strip())
