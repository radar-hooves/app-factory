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
        # Structured only. `details` is serialised straight into the JSON error
        # body, so a mapping is the shape a caller can actually act on; a bare
        # sentence goes in `message`. Accepting both was two doors onto one job.
        details: dict[str, Any] | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        self.context = context or {}


class BadRequestError(BackendBaseException):
    """The request itself is malformed or self-contradictory (400).

    Distinct from ValidationError (422): that one means a well-formed request
    whose values failed a domain rule.
    """

    status_code = 400
    error_code = "bad_request"


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


class ConflictError(BackendBaseException):
    """The request conflicts with the resource's current state (409)."""

    status_code = 409
    error_code = "conflict"


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


# Keys the logging module reserves on a LogRecord. Passing any of them through
# `extra=` does not shadow the attribute — it raises KeyError inside makeRecord,
# so a typed error carrying an innocuous context key like `name` stops being an
# error response and becomes an unhandled 500. Measured 24/08/2026 in a stamped
# app: a duplicate-name save raised a clean, correct DatabaseError, and the
# handler meant to report it crashed on `Attempt to overwrite 'name' in
# LogRecord`, so the UI showed "an unexpected error occurred" for a condition
# the service had diagnosed precisely. The app is not named here on purpose —
# the parity checker rewrites an app's OWN name to a placeholder, so a factory
# file naming one app can never hash equal in that app and is unconvergeable
# there by construction.
#
# The workaround was previously per-call-site, which only holds until the next
# author picks a colliding word. Prefixing here means a call site can put
# whatever it likes in `context`.
_RESERVED_LOG_KEYS = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)


def safe_log_context(context: dict[str, object]) -> dict[str, object]:
    """Rename any key logging reserves, so `extra=` can never raise.

    A colliding key is prefixed `ctx_` rather than dropped: the value is the
    diagnostic the author wanted in the log, and losing it silently would be a
    quieter version of the same defect.
    """
    return {(f"ctx_{k}" if k in _RESERVED_LOG_KEYS else k): v for k, v in context.items()}


def _log_exception(request: Request, exc: BackendBaseException) -> None:
    """Log one typed exception with everything that names WHY it was raised.

    Three things reach the log, and each was missing at least once:

    * ``exc.message`` and ``exc.context`` — as before.
    * ``exc.details`` — the structured diagnostic. It is already serialised
      into the JSON error body, so a caller can read it and the log could not;
      that asymmetry is the defect, not a precaution.
    * the CHAINED CAUSE, via ``exc_info``. Raise sites across these apps write
      ``raise SomeError(...) from exc``, and without it a broker failure logs
      only ``BrokerUnavailable: Live IBKR figures are unavailable`` while the
      cause (``no software identity key at <path>``, carried on the
      ``VendError`` underneath) stays inside the running container. ``exc_info``
      renders the whole ``__cause__`` chain under every formatter here,
      including the plain one, where a structured ``extra=`` key is simply not
      printed.

      No app is named above on purpose: this file is factory-owned, and a file
      that names one app hashes differently in THAT app once parity
      normalisation replaces its name -- so the app the lesson came from is the
      one app that could never take the file.

    Passed only when there IS a cause, so a self-contained 404 still logs as one
    line. The shared formatter
    ``api_common.telemetry.configure()`` installs runs the redaction floor over
    the fully rendered line — the traceback included — and Python renders no frame locals, so no
    value can ride out on this path.
    """
    log_context = safe_log_context({"path": request.url.path, "method": request.method, **exc.context})
    if exc.details:
        log_context["details"] = exc.details
    logger.error(
        "%s: %s",
        exc.__class__.__name__,
        exc.message,
        extra=log_context,
        exc_info=exc.__cause__ if exc.__cause__ is not None else None,
    )


async def bad_request_error_handler(request: Request, exc: BadRequestError) -> JSONResponse:
    _log_exception(request, exc)
    return _build_error_response(exc)


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


async def conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
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
    _register(app, BadRequestError, bad_request_error_handler)
    _register(app, NotFoundError, not_found_error_handler)
    _register(app, ValidationError, validation_error_handler)
    _register(app, AuthenticationError, authentication_error_handler)
    _register(app, ForbiddenError, forbidden_error_handler)
    _register(app, ConflictError, conflict_error_handler)
    _register(app, UpstreamServiceError, upstream_service_error_handler)
    _register(app, ServiceUnavailableError, service_unavailable_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
