"""Minimal async client for the Cloudflare Workers AI REST API, with JSON mode.

Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
Through AI Gateway: POST https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/workers-ai/{model}
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

import httpx

from app.core.config import Settings

API_BASE = "https://api.cloudflare.com/client/v4"
GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1"


class WorkersAIError(Exception):
    pass


class WorkersAIClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        if not settings.cloudflare_account_id or not settings.cloudflare_api_token:
            raise WorkersAIError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are not set.")
        self._settings = settings
        self._transport = transport

    def model_url(self, model: str) -> str:
        account = self._settings.cloudflare_account_id
        if self._settings.cloudflare_ai_gateway_id:
            return f"{GATEWAY_BASE}/{account}/{self._settings.cloudflare_ai_gateway_id}/workers-ai/{model}"
        return f"{API_BASE}/accounts/{account}/ai/run/{model}"

    async def run_json(
        self,
        model: str,
        messages: Sequence[Mapping[str, str]],
        schema: Mapping[str, Any],
        max_tokens: int = 256,
    ) -> dict[str, Any]:
        """Run a chat model in JSON mode and return the parsed JSON object."""
        payload = {
            "messages": list(messages),
            "response_format": {"type": "json_schema", "json_schema": schema},
            "max_tokens": max_tokens,
            "temperature": 0,
        }
        headers = {"Authorization": f"Bearer {self._settings.cloudflare_api_token}"}
        try:
            async with httpx.AsyncClient(timeout=30.0, transport=self._transport) as http:
                response = await http.post(self.model_url(model), json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise WorkersAIError(f"Workers AI is unreachable: {exc}") from exc
        try:
            body = response.json()
        except ValueError as exc:
            raise WorkersAIError(f"Workers AI returned non-JSON ({response.status_code}).") from exc
        if response.is_error or not body.get("success", True):
            errors = body.get("errors") if isinstance(body, dict) else None
            raise WorkersAIError(f"Workers AI error {response.status_code}: {errors or body}")

        result = body.get("result", body)
        output = result.get("response") if isinstance(result, dict) else None
        # JSON mode returns an object. Some models return a JSON string instead.
        if isinstance(output, str):
            try:
                output = json.loads(output)
            except ValueError as exc:
                raise WorkersAIError("The model output is not valid JSON.") from exc
        if not isinstance(output, dict):
            raise WorkersAIError("The model output is not a JSON object.")
        return output
