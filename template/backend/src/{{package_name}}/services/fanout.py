"""Bounded thread-pool fan-out helper for I/O-bound work.

Sync SQLAlchemy is the household way (`rules-library/dev-platform/30-canonical-app-shape.md`);
this is the concurrency valve for a request path that genuinely fans out I/O
(e.g. calling several independent external services) inside that sync world,
in place of an app-wide async flip.
"""

from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

DEFAULT_MAX_WORKERS = 8


@dataclass(frozen=True)
class FanoutResult[T]:
    """One callable's outcome. Exactly one of `value` / `error` is set."""

    value: T | None
    error: Exception | None

    @property
    def ok(self) -> bool:
        return self.error is None


def run_fanout[T](
    calls: Sequence[Callable[[], T]], *, max_workers: int = DEFAULT_MAX_WORKERS
) -> list[FanoutResult[T]]:
    """Run `calls` concurrently on a bounded thread pool.

    Each callable's outcome is captured individually — one failure does not
    cancel or hide the others — and returned in the same order `calls` were
    given, so a caller can zip results back against their inputs. Every
    exception is captured explicitly on its FanoutResult; a caller that never
    checks `.error` still has it in the return value, not silently dropped.

    Args:
        calls: zero-argument callables to run (e.g. a closure or
            `functools.partial`), one per unit of fan-out work.
        max_workers: upper bound on concurrent threads.

    Returns:
        One FanoutResult per call, in input order.
    """
    if not calls:
        return []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(call) for call in calls]
        results: list[FanoutResult[T]] = []
        for future in futures:
            try:
                results.append(FanoutResult(value=future.result(), error=None))
            except Exception as exc:
                results.append(FanoutResult(value=None, error=exc))
    return results
