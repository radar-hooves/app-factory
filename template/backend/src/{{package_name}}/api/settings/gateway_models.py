"""One generic call: which model IDs a gateway's key can currently reach.

For a `model_alias` setting's `list_models` (`declare.py`). An app closes over
its own gateway URL and key to supply the zero-arg callable this shape wants;
this module holds no gateway of its own and reads no app settings.

Only reached when an app actually wires a `model_alias` setting to it, so it
adds no import-time dependency to a fresh stamp declaring none — but an app
that does wire one must add `openai` to its own `pyproject.toml` (any app
already calling an OpenAI-compatible gateway for its domain logic, godswood's
`litellm_client` among them, already carries it).
"""

import logging
import threading
import time

import openai

logger = logging.getLogger(__name__)

# One request asks once per `model_alias` setting; the cache (failures too) makes
# that one round trip, and stays short so a newly reachable model shows in seconds.
_CACHE_TTL_SECONDS = 5.0
_cache: dict[tuple[str, str], tuple[float, list[str]]] = {}
_cache_lock = threading.Lock()


def list_gateway_models(base_url: str, api_key: str, *, timeout: float = 3.0) -> list[str]:
    """Return the model IDs `base_url` answers for `api_key`, or `[]` on failure.

    Never raises: a `model_alias` setting must degrade when its gateway is
    unreachable, not refuse a read or a write (`docs/design/settings.md`
    §Model alias). The caller decides what an empty list means.
    """
    cache_key = (base_url, api_key)
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]
    try:
        client = openai.OpenAI(base_url=base_url, api_key=api_key, max_retries=0, timeout=timeout)
        models = [model.id for model in client.models.list().data]
    except Exception:  # degrade to "unknown", never propagate
        logger.warning("Could not list models from gateway %r", base_url, exc_info=True)
        models = []
    with _cache_lock:
        _cache[cache_key] = (now, models)
    return models
