"""Logging configuration.

Call configure_logging() once at application startup (in the app factory).
Uses named loggers (logging.getLogger(__name__)) everywhere; never the root logger.
"""

import logging


def configure_logging(*, debug: bool = False) -> None:
    """Configure application-wide logging.

    Args:
        debug: Enable DEBUG level logging when True; INFO otherwise.
    """
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    # Suppress noisy third-party loggers.
    for noisy in ("httpx", "httpcore", "asyncio", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
