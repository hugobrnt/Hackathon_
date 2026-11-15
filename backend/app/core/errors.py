"""Mapping of Zernio errors to HTTP responses."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.integrations.zernio.client import ZernioError


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


ZERNIO_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Zernio rejected the API key."},
    403: {"model": ErrorResponse, "description": "Zernio denied access (for example, the Inbox add-on is missing)."},
    404: {"model": ErrorResponse, "description": "Resource not found."},
    502: {"model": ErrorResponse, "description": "Zernio or the social platform returned an error."},
}

_RELAYED_STATUSES = {400, 401, 403, 404, 429}


async def zernio_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ZernioError)
    status = exc.status_code if exc.status_code in _RELAYED_STATUSES else 502
    body = ErrorResponse(detail=exc.message, code=exc.code)
    return JSONResponse(status_code=status, content=body.model_dump())


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ZernioError, zernio_error_handler)
