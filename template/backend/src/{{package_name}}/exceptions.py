"""Application exception hierarchy.

All domain exceptions inherit from AppError so callers can catch the base
and still handle subtypes by specificity. The registered FastAPI exception
handler maps these to HTTP responses (see api/main.py).
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base exception for all application errors."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, message: str, *, details: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(AppError):
    """Resource does not exist."""

    status_code = 404
    error_code = "not_found"


class ValidationError(AppError):
    """Input failed domain validation (distinct from Pydantic's request validation)."""

    status_code = 422
    error_code = "validation_error"


class AuthError(AppError):
    """Authentication or authorisation failure."""

    status_code = 401
    error_code = "auth_error"


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Map AppError subclasses to structured JSON HTTP responses."""
    assert isinstance(exc, AppError)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )
