"""Application exception hierarchy.

Every domain exception inherits from BackendBaseException so callers can
catch the base and still handle subtypes by specificity. Each concrete
subtype has its own registered FastAPI exception handler (register_exception_handlers,
called from the app factory) rather than one generic handler, so each maps to
its own HTTP status and log treatment.
"""

import logging
from collections.abc import Awaitable, Callable
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ExceptionHandler

logger = logging.getLogger(__name__)


class BackendBaseException(Exception):
    """Base for all application exceptions."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(
        self,
        message: str,
        *,
        details: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        self.context = context or {}


class NotFoundError(BackendBaseException):
    """Resource does not exist."""

    status_code = 404
    error_code = "not_found"


class ValidationError(BackendBaseException):
    """Input failed domain validation (distinct from Pydantic's request validation)."""

    status_code = 422
    error_code = "validation_error"


class AuthenticationError(BackendBaseException):
    """Authentication failed (401)."""

    status_code = 401
    error_code = "authentication_error"


class ForbiddenError(BackendBaseException):
    """Caller is authenticated but lacks permission for this resource (403)."""

    status_code = 403
    error_code = "forbidden"


class UpstreamServiceError(BackendBaseException):
    """A dependent external service failed or returned an unusable response (502)."""

    status_code = 502
    error_code = "upstream_service_error"


class ServiceUnavailableError(BackendBaseException):
    """This service cannot process the request right now (503)."""

    status_code = 503
    error_code = "service_unavailable"


def _build_error_response(exc: BackendBaseException, *, headers: dict[str, str] | None = None) -> JSONResponse:
    content: dict[str, object] = {"error": exc.error_code, "message": exc.message}
    if exc.details:
        content["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=content, headers=headers)


def _log_exception(request: Request, exc: BackendBaseException) -> None:
    log_context = {"path": request.url.path, "method": request.method, **exc.context}
    logger.error("%s: %s", exc.__class__.__name__, exc.message, extra=log_context)


async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc)


async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc)


async def authentication_error_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc, headers={"WWW-Authenticate": "Bearer"})


async def forbidden_error_handler(request: Request, exc: ForbiddenError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc)


async def upstream_service_error_handler(request: Request, exc: UpstreamServiceError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc)


async def service_unavailable_error_handler(request: Request, exc: ServiceUnavailableError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception in %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "An unexpected error occurred. Please try again later.",
        },
    )


def _register(
    app: FastAPI,
    exc_class: type[Exception],
    handler: Callable[[Request, Any], Awaitable[JSONResponse]],
) -> None:
    """Register one handler, reconciling it with Starlette's handler typing.

    Starlette's ``add_exception_handler`` wants a handler typed for the
    ``Exception`` base class; each handler above is deliberately typed for
    its own specific subclass instead, which is what keeps its body
    readable. This is the one place that bridges the two, instead of a
    scattered ignore at every registration call.
    """
    app.add_exception_handler(exc_class, cast(ExceptionHandler, handler))


def register_exception_handlers(app: FastAPI) -> None:
    """Register one handler per exception type on the FastAPI app instance.

    Call from the app factory after creating the app:
        register_exception_handlers(app)
    """
    _register(app, NotFoundError, not_found_error_handler)
    _register(app, ValidationError, validation_error_handler)
    _register(app, AuthenticationError, authentication_error_handler)
    _register(app, ForbiddenError, forbidden_error_handler)
    _register(app, UpstreamServiceError, upstream_service_error_handler)
    _register(app, ServiceUnavailableError, service_unavailable_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
