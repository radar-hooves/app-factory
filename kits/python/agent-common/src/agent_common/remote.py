"""A stdio MCP server that forwards each message to a streamable-HTTP one, with headers the app minted.

The bridge runs this as the app, outside a session's confinement, in place of
an HTTP server whose header a `headersHelper` mints (`bridge`): the helper
runs here, so whatever it reads stays out of the session. It interprets
nothing. Each JSON-RPC line on stdin is POSTed to the server, and each
message of the answer, a JSON body or an event stream, is written back as a
line on stdout; the server's session id is carried from `initialize` on. A
401 runs the helper again once, for a header that expired. A helper that
fails exits this process, and the CLI goes on without the server.

Not FastMCP's proxy: importing fastmcp takes 1.6 s, measured on atlas
20/10/2026, and the CLI waits for every server before its first model call,
so it would sit on the answer path of every question; httpx takes 0.25 s.
"""

import asyncio
import contextlib
import json
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from typing import Any

import httpx

#: The server's URL.
URL_VARIABLE = "AGENT_COMMON_REMOTE_URL"
#: The entry's own headers, one `Name: value` a line, already expanded.
HEADERS_VARIABLE = "AGENT_COMMON_REMOTE_HEADERS"
#: The command whose stdout is a JSON object of headers, run by `sh -c`.
HELPER_VARIABLE = "AGENT_COMMON_REMOTE_HELPER"

#: The CLI waits for every server before its first model call, so a helper is bounded well inside that.
HELPER_SECONDS = 10.0
#: One stdin line may carry a large tool result back the other way; this bounds a request.
LINE_LIMIT = 16 * 1024 * 1024
_TIMEOUT = httpx.Timeout(30.0, read=600.0)
_PROTOCOL_HEADER = "mcp-protocol-version"
_SESSION_HEADER = "mcp-session-id"


class HelperFailed(RuntimeError):
    """The headers helper exited badly, timed out or printed no JSON object."""


def helper_headers(command: str) -> dict[str, str]:
    """The headers `command` prints.

    Raises:
        HelperFailed: as the class says.
    """
    try:
        done = subprocess.run(
            ["/bin/sh", "-c", command], capture_output=True, text=True, timeout=HELPER_SECONDS, check=True
        )
        headers = json.loads(done.stdout)
    except (subprocess.SubprocessError, OSError, ValueError) as exc:
        raise HelperFailed(f"headers helper failed: {type(exc).__name__}") from None
    if not isinstance(headers, dict):
        raise HelperFailed("headers helper printed no JSON object")
    return {str(name): str(value) for name, value in headers.items()}


def entry_headers(text: str) -> dict[str, str]:
    """`HEADERS_VARIABLE`'s lines as a mapping."""
    pairs = (line.partition(":") for line in text.splitlines() if ":" in line)
    return {name.strip(): value.strip() for name, _, value in pairs if name.strip()}


class Relay:
    """One server's session, as the stdio side sees it."""

    def __init__(self, client: httpx.AsyncClient, url: str, own: dict[str, str], helper: str) -> None:
        self._client = client
        self._url = url
        self._own = own
        self._helper = helper
        self._minted = helper_headers(helper) if helper else {}
        self._session: str | None = None
        self._protocol: str | None = None
        self._writing = asyncio.Lock()

    async def forward(self, line: bytes) -> None:
        """POST one stdin line and write back every message of the answer; a request that fails is answered with an error."""
        try:
            message = json.loads(line)
        except ValueError:
            return
        try:
            async for answer in self._post(line, retry=True):
                if isinstance(answer, dict) and isinstance(answer.get("result"), dict):
                    version = answer["result"].get("protocolVersion")
                    self._protocol = version if isinstance(version, str) else self._protocol
                await self._write(answer)
        except (httpx.HTTPError, HelperFailed, ValueError) as exc:
            # Named by kind and status alone: an httpx error's text carries the URL, which a query may sign.
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            said = (
                f"the server answered {status}" if status else f"the server could not be reached ({type(exc).__name__})"
            )
            for request in message if isinstance(message, list) else [message]:
                if isinstance(request, dict) and "id" in request and "method" in request:
                    await self._write(
                        {"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32000, "message": said}}
                    )

    async def close(self) -> None:
        """End the server's session, where it named one."""
        if self._session is not None:
            with contextlib.suppress(httpx.HTTPError):
                await self._client.delete(self._url, headers=self._headers())

    def _headers(self) -> dict[str, str]:
        headers = {**self._own, **self._minted}
        if self._session:
            headers[_SESSION_HEADER] = self._session
        if self._protocol:
            headers[_PROTOCOL_HEADER] = self._protocol
        return headers

    async def _post(self, body: bytes, *, retry: bool) -> AsyncIterator[Any]:
        headers = {
            **self._headers(),
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        }
        async with self._client.stream("POST", self._url, content=body, headers=headers) as response:
            if response.status_code == 401 and retry and self._helper:
                self._minted = await asyncio.to_thread(helper_headers, self._helper)
            else:
                response.raise_for_status()
                self._session = response.headers.get(_SESSION_HEADER, self._session)
                kind = response.headers.get("content-type", "")
                if kind.startswith("text/event-stream"):
                    async for data in _events(response):
                        yield json.loads(data)
                elif kind.startswith("application/json"):
                    answer = json.loads(await response.aread())
                    for message in answer if isinstance(answer, list) else [answer]:
                        yield message
                return
        async for message in self._post(body, retry=False):
            yield message

    async def _write(self, message: object) -> None:
        async with self._writing:
            sys.stdout.buffer.write(json.dumps(message).encode() + b"\n")
            sys.stdout.buffer.flush()


async def _events(response: httpx.Response) -> AsyncIterator[str]:
    """Each event's data, as a server-sent-events stream frames it."""
    data: list[str] = []
    async for line in response.aiter_lines():
        if not line:
            if data:
                yield "\n".join(data)
            data = []
        elif line.startswith("data:"):
            data.append(line[5:].removeprefix(" "))
    if data:
        yield "\n".join(data)


async def _main() -> None:
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=LINE_LIMIT)
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            relay = Relay(
                client,
                os.environ[URL_VARIABLE],
                entry_headers(os.environ.get(HEADERS_VARIABLE, "")),
                os.environ.get(HELPER_VARIABLE, ""),
            )
        except HelperFailed as exc:
            sys.stderr.write(f"agent_common.remote: {exc}\n")
            sys.exit(1)
        async with asyncio.TaskGroup() as group:
            while line := await reader.readline():
                if line.strip():
                    group.create_task(relay.forward(line))
        await relay.close()


if __name__ == "__main__":
    asyncio.run(_main())
