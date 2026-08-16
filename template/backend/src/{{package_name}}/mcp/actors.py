"""Server-side actor registry: maps an authenticated client identity to an Actor.

This is the household's canonical actor-registry for an app-mounted MCP tool
surface, paired with ``http_auth.py``. Every household app that mounts an MCP
server over HTTP carries a byte-identical copy of this module (only the actor
entries in ``config/actors.yaml`` differ per service).

Actors are never self-declared by callers. The registry is keyed on the
authenticated client identity string that ``http_auth.require_bearer_auth``
resolves from the validated Authentik bearer (and writes to the ``x-client-id``
header), or the hard-coded local-console sentinel for a trusted in-process
caller.

An identity absent from the registry is refused (``KeyError``) — the server,
never the caller, decides the actor and its type. Callers surface that refusal
as a 401 or a typed MCP error; it is never silently defaulted to a privileged
identity.

Config format (``config/actors.yaml``)::

    actors:
      - client_id: local-console
        actor_id: principal
        actor_type: principal
        display: Local Console
      - client_id: mcp-service
        actor_id: claude-code
        actor_type: agent
        display: Claude Code via mcp-gateway
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

# The local console session is always the trusted local caller in development.
_DEFAULT_LOCAL_CLIENT = "local-console"


@dataclass(frozen=True, slots=True)
class Actor:
    """A resolved caller identity.

    Self-contained by design so this module is a drop-in carbon-copy across
    every household MCP app, independent of any one app's domain models. An app
    maps ``actor_id`` / ``actor_type`` onto its own server-side authorisation
    (roles, grants, tenancy) — Authentik authenticates; the app authorises.
    """

    id: str
    type: str
    display: str = ""


_DEFAULT_ACTOR = Actor(id="principal", type="principal", display="Local Console")


class ActorRegistry:
    """Map a client identity string to an :class:`Actor`."""

    def __init__(self, config_path: Path | None = None) -> None:
        self._map: dict[str, Actor] = {_DEFAULT_LOCAL_CLIENT: _DEFAULT_ACTOR}
        if config_path is not None and config_path.exists():
            self._load(config_path)

    def _load(self, path: Path) -> None:
        with path.open("r", encoding="utf-8") as fh:
            raw: dict[str, Any] = yaml.safe_load(fh) or {}
        for entry in raw.get("actors", []):
            client_id = str(entry["client_id"])
            self._map[client_id] = Actor(
                id=str(entry["actor_id"]),
                type=str(entry["actor_type"]),
                display=str(entry.get("display", "")),
            )

    def resolve(self, client_id: str) -> Actor:
        """Return the Actor for ``client_id``.

        Raises ``KeyError`` when the client identity is not registered — callers
        surface this as a 401 or a typed MCP error, never a silent default.
        """
        return self._map[client_id]

    def registered_ids(self) -> list[str]:
        """Return all registered client identity strings."""
        return list(self._map.keys())
