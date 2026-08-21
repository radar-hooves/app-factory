"""Bearer-token gate for the HTTP-mounted MCP endpoint.

This is the household's canonical inbound-auth gate for an app-mounted MCP tool
surface: every household app that mounts an MCP server over HTTP carries a
byte-identical copy of this module (only the service name in docstrings differs).
See the fleet-auth-and-transport reference for why the shape is fixed.

Model: each HTTP MCP client presents an Authentik OAuth2 Bearer token
(authorization-code for interactive callers, client_credentials for machine
consumers). Any reverse proxy may gate requests at the edge; this middleware
validates the SAME bearer against the Authentik userinfo endpoint and reads the
configured identity claim (default ``preferred_username``, falling back to
``sub``) as the caller's client identity. That identity is written to the
``x-client-id`` header, which the tool layer's ``ActorGateMiddleware``
(``mcp/auth.py``) reads — HTTP callers cannot self-declare identity, and no
token value is ever logged or written to the config file.

A short-lived in-memory cache (keyed on a sha256 of the token, never the
plaintext) avoids a userinfo round trip on every request from an
already-validated caller.

The stdio transport never enters this ASGI app, so in-process / local stdio
access is unaffected.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import Mapping
from typing import cast

import httpx

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60.0
_CACHE_MAX_ENTRIES = 256
_USERINFO_TIMEOUT_SECONDS = 5.0


class _TokenCache:
    """In-memory TTL cache mapping a token's sha256 hash to its resolved identity.

    Never stores the plaintext token. Bounded with simple FIFO eviction so
    memory stays flat under sustained traffic from many distinct callers.
    """

    def __init__(self, ttl_seconds: float = _CACHE_TTL_SECONDS, max_entries: int = _CACHE_MAX_ENTRIES) -> None:
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._entries: dict[str, tuple[str, float]] = {}

    def get(self, token_hash: str) -> str | None:
        """Return the cached identity for token_hash, or None if absent/expired."""
        entry = self._entries.get(token_hash)
        if entry is None:
            return None
        identity, expiry = entry
        if time.monotonic() >= expiry:
            del self._entries[token_hash]
            return None
        return identity

    def set(self, token_hash: str, identity: str) -> None:
        """Cache identity for token_hash, evicting the oldest entry if at capacity."""
        if token_hash not in self._entries and len(self._entries) >= self._max_entries:
            oldest_key = next(iter(self._entries))
            del self._entries[oldest_key]
        self._entries[token_hash] = (identity, time.monotonic() + self._ttl)


def require_bearer_auth(
    app: object,
    *,
    userinfo_url: str,
    identity_claim: str = "preferred_username",
    resource_metadata_url: str = "",
    transport: httpx.AsyncBaseTransport | None = None,
) -> object:
    """Wrap an ASGI app so every HTTP request must carry a valid OAuth2 Bearer token.

    The middleware is the sole writer of the ``x-client-id`` header; any
    client-supplied value is stripped and replaced with the identity resolved
    from the validated token. Non-HTTP scopes (lifespan, websocket) pass
    through unchanged.

    Args:
        app: The ASGI application to protect (the FastMCP HTTP app).
        userinfo_url: The OIDC userinfo endpoint to validate bearer tokens
            against. An empty string fails every request closed (401).
        identity_claim: The userinfo claim used as the client identity;
            falls back to ``sub`` when the claim is absent.
        resource_metadata_url: Protected-resource metadata URL advertised in
            the 401 ``WWW-Authenticate`` header (RFC 9728); omitted when empty.
        transport: Optional httpx transport override (tests inject a
            ``httpx.MockTransport`` here); production leaves this as None for
            a real network client.

    Returns:
        An ASGI callable that enforces bearer-token auth before delegating to ``app``.
    """
    cache = _TokenCache()
    client = httpx.AsyncClient(transport=transport, timeout=_USERINFO_TIMEOUT_SECONDS)

    async def gated_app(scope: dict[str, object], receive: object, send: object) -> None:
        if scope["type"] != "http":
            await app(scope, receive, send)  # type: ignore[operator]
            return

        token = _extract_bearer_token(scope)
        if token is None or not userinfo_url:
            await _drain_body(receive)
            await _send_unauthorized(send, resource_metadata_url)
            return

        status, identity = await _resolve_identity(
            token,
            userinfo_url=userinfo_url,
            identity_claim=identity_claim,
            cache=cache,
            client=client,
        )
        if status == 503:
            await _drain_body(receive)
            await _send_unavailable(send)
            return
        if status != 200 or identity is None:
            logger.warning("MCP HTTP request rejected: bearer token did not validate")
            await _drain_body(receive)
            await _send_unauthorized(send, resource_metadata_url)
            return

        logger.debug("Resolved MCP HTTP identity: %s", identity)

        # A header value must be latin-1 encodable; an identity with characters
        # outside it (an unusual Authentik username) cannot be a header-safe
        # client id and would never match a registered actor, so fail closed
        # rather than raise an uncaught UnicodeEncodeError (HTTP 500).
        try:
            client_id_header = identity.encode("latin-1")
        except UnicodeEncodeError:
            logger.warning("MCP HTTP request rejected: resolved identity is not header-safe")
            await _drain_body(receive)
            await _send_unauthorized(send, resource_metadata_url)
            return

        # Copy scope and rewrite headers: remove any client-supplied x-client-id,
        # then append the server-resolved value. Do not mutate the caller's scope.
        new_scope = dict(scope)
        existing: list[tuple[bytes, bytes]] = cast("list[tuple[bytes, bytes]]", scope.get("headers") or [])
        raw_headers: list[tuple[bytes, bytes]] = [
            (name, value) for name, value in existing if name.lower() != b"x-client-id"
        ]
        raw_headers.append((b"x-client-id", client_id_header))
        new_scope["headers"] = raw_headers

        await app(new_scope, receive, send)  # type: ignore[operator]

    # Expose the userinfo client so the host app's lifespan can close it on
    # shutdown; without this the connection pool leaks across create_app()
    # calls (tests, hot-reload, multi-instance tooling).
    gated_app.aclose = client.aclose  # type: ignore[attr-defined]
    return gated_app


def _extract_bearer_token(scope: dict[str, object]) -> str | None:
    """Return the presented bearer token from ``Authorization: Bearer <token>``."""
    raw: list[tuple[bytes, bytes]] = cast("list[tuple[bytes, bytes]]", scope.get("headers") or [])
    headers: dict[bytes, bytes] = {name.lower(): value for name, value in raw}

    authorization = headers.get(b"authorization")
    if not authorization:
        return None
    value = authorization.decode("latin-1").strip()
    if not value.lower().startswith("bearer "):
        return None
    token = value[7:].strip()
    return token or None


async def _resolve_identity(
    token: str,
    *,
    userinfo_url: str,
    identity_claim: str,
    cache: _TokenCache,
    client: httpx.AsyncClient,
) -> tuple[int, str | None]:
    """Validate token against the userinfo endpoint, using the cache when warm.

    Returns:
        (200, identity) on success, (401, None) when the token does not
        validate or the response carries no usable identity claim, or
        (503, None) when the userinfo endpoint is unreachable.
    """
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    cached = cache.get(token_hash)
    if cached is not None:
        return 200, cached

    try:
        response = await client.get(userinfo_url, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError:
        logger.warning("OIDC userinfo endpoint unreachable")
        return 503, None

    if response.status_code != 200:
        return 401, None

    try:
        claims: Mapping[str, object] = response.json()
    except ValueError:
        logger.warning("OIDC userinfo returned a non-JSON body")
        return 401, None

    identity = claims.get(identity_claim) or claims.get("sub")
    if not identity:
        logger.warning("OIDC userinfo response missing %r and sub claims", identity_claim)
        return 401, None

    resolved = str(identity)
    cache.set(token_hash, resolved)
    return 200, resolved


async def _drain_body(receive: object) -> None:
    """Consume the HTTP request body so the connection is left in a clean state.

    Loops until ``more_body`` is falsy or a ``http.disconnect`` event arrives.
    Skipping the drain on an HTTP/1.1 connection with an unconsumed body leaves
    the connection in an inconsistent state, preventing keep-alive reuse.
    """
    while True:
        event: dict[str, object] = await receive()  # type: ignore[operator]
        event_type = event.get("type", "")
        if event_type == "http.disconnect":
            return
        if event_type == "http.request" and not event.get("more_body", False):
            return


async def _send_unauthorized(send: object, resource_metadata_url: str) -> None:
    """Emit a 401 JSON response without delegating to the inner app."""
    body = json.dumps({"error": "unauthorized", "message": "A valid Bearer token is required"}).encode()
    www_authenticate = "Bearer"
    if resource_metadata_url:
        www_authenticate += f', resource_metadata="{resource_metadata_url}"'
    await send(  # type: ignore[operator]
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"www-authenticate", www_authenticate.encode("latin-1")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})  # type: ignore[operator]


async def _send_unavailable(send: object) -> None:
    """Emit a 503 JSON response when the identity provider cannot be reached."""
    body = json.dumps({"error": "auth_unavailable", "message": "The identity provider is unreachable"}).encode()
    await send(  # type: ignore[operator]
        {
            "type": "http.response.start",
            "status": 503,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})  # type: ignore[operator]
