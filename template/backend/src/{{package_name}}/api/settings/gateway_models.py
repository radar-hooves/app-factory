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

import openai

logger = logging.getLogger(__name__)


def list_gateway_models(base_url: str, api_key: str, *, timeout: float = 10.0) -> list[str]:
    """Return the model IDs `base_url` answers for `api_key`, or `[]` on failure.

    Never raises: a `model_alias` setting must degrade when its gateway is
    unreachable, not refuse a read or a write (`docs/design/settings.md`
    §Model alias). The caller decides what an empty list means.
    """
    try:
        client = openai.OpenAI(base_url=base_url, api_key=api_key, max_retries=0, timeout=timeout)
        return [model.id for model in client.models.list().data]
    except Exception:  # degrade to "unknown", never propagate
        logger.warning("Could not list models from gateway %r", base_url, exc_info=True)
        return []
