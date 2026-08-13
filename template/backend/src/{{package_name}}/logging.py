"""Logging configuration.

Call configure_logging() once at application startup (in the app factory).
Uses named loggers (logging.getLogger(__name__)) everywhere; never the root logger.
"""

import logging
import re
from contextvars import ContextVar

# Correlation id for the in-flight request. Set by middleware.RequestIDMiddleware
# and read by _RequestIdFilter so every log record emitted while handling a
# request carries the same id. Defaults to "-" for records emitted outside a
# request (startup, scripts).
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Value-pattern redaction applied to every rendered log line, independent of
# the caller passing values via the structured `extra` dict — catches a
# secret interpolated straight into a message string (e.g. an f-string with
# a token in it) that key-based redaction cannot see.
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b")
_BEARER_RE = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-]+")
_KV_SECRET_RE = re.compile(
    r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key)\b(\"?\s*[=:]\s*\"?)([^\s,&\"'}]+)"
)
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")


def redact(text: str) -> str:
    """Mask secrets and PII in a rendered log line: JWTs, Bearer tokens,
    password/token/secret/api_key key=value pairs, and email addresses.
    """
    text = _JWT_RE.sub("[REDACTED_JWT]", text)
    text = _BEARER_RE.sub("Bearer [REDACTED]", text)
    text = _KV_SECRET_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", text)
    text = _EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    return text


class _RequestIdFilter(logging.Filter):
    """Stamp the in-flight request's correlation id onto every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return True


class _RedactingFormatter(logging.Formatter):
    """Formatter that redacts secrets/PII from the fully rendered line."""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def configure_logging(*, debug: bool = False) -> None:
    """Configure application-wide logging.

    Args:
        debug: Enable DEBUG level logging when True; INFO otherwise.
    """
    level = logging.DEBUG if debug else logging.INFO
    handler = logging.StreamHandler()
    handler.setFormatter(
        _RedactingFormatter(
            fmt="%(asctime)s %(levelname)-8s %(name)s [%(request_id)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    )
    handler.addFilter(_RequestIdFilter())
    logging.basicConfig(level=level, handlers=[handler])
    # Suppress noisy third-party loggers.
    for noisy in ("httpx", "httpcore", "asyncio", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
