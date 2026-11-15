"""Classifiers: Workers AI (small model, then large model if ambiguous) and the heuristic fallback."""

import logging
from typing import Protocol

from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.domains.classification.heuristic import classify_heuristic
from app.domains.classification.prompt import CLASSIFICATION_SCHEMA, build_messages
from app.domains.classification.schemas import ClassificationInput, ClassificationOutput
from app.integrations.cloudflare.workers_ai import WorkersAIClient, WorkersAIError

logger = logging.getLogger(__name__)


class Classifier(Protocol):
    async def classify(self, item: ClassificationInput) -> ClassificationOutput: ...


class HeuristicClassifier:
    async def classify(self, item: ClassificationInput) -> ClassificationOutput:
        return classify_heuristic(item)


class WorkersAIClassifier:
    """Small model for each message. The large model only for low confidence or invalid output.

    If both models fail, the heuristic gives the result (`fallback=True`).
    """

    def __init__(self, settings: Settings, client: WorkersAIClient | None = None) -> None:
        self._settings = settings
        self._client = client or WorkersAIClient(settings)

    async def _run(self, model: str, item: ClassificationInput) -> ClassificationOutput:
        raw = await self._client.run_json(model, build_messages(item), CLASSIFICATION_SCHEMA)
        try:
            return ClassificationOutput.model_validate({**raw, "model": model})
        except ValidationError as exc:
            raise WorkersAIError(f"Invalid classification from {model}: {exc}") from exc

    async def classify(self, item: ClassificationInput) -> ClassificationOutput:
        small = self._settings.classifier_small_model
        large = self._settings.classifier_large_model
        first: ClassificationOutput | None = None
        try:
            first = await self._run(small, item)
            if first.confidence >= self._settings.classifier_escalation_threshold:
                return first
        except WorkersAIError as exc:
            logger.warning("Small model failed: %s", exc)
        try:
            second = await self._run(large, item)
            return second.model_copy(update={"escalated": True})
        except WorkersAIError as exc:
            logger.warning("Large model failed: %s", exc)
        if first is not None:
            return first
        return classify_heuristic(item).model_copy(update={"fallback": True})


def get_classifier() -> Classifier:
    """FastAPI dependency. Workers AI if it is configured, else the heuristic."""
    settings = get_settings()
    if settings.cloudflare_account_id and settings.cloudflare_api_token:
        return WorkersAIClassifier(settings)
    return HeuristicClassifier()
