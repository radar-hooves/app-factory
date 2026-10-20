"""An HTTP server whose header a helper mints, reached through the bridge and `remote` as a session reaches it."""

import asyncio
import json
import os
import subprocess
import sys
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest
from agent_common import bridge, remote


class _Upstream(ThreadingHTTPServer):
    """A streamable-HTTP MCP server: `initialize` answers JSON and names a session, anything else an event stream."""

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _Handler)
        self.seen: list[dict[str, Any]] = []
        self.refuse_first = False
        self.fail = False


class _Handler(BaseHTTPRequestHandler):
    server: _Upstream

    def log_message(self, *_: object) -> None:
        pass

    def do_DELETE(self) -> None:
        self.server.seen.append({"method": "DELETE", "headers": dict(self.headers)})
        self.send_response(200)
        self.end_headers()

    def do_POST(self) -> None:
        message = json.loads(self.rfile.read(int(self.headers["content-length"])))
        self.server.seen.append({"method": message.get("method"), "headers": dict(self.headers)})
        if self.server.refuse_first:
            self.server.refuse_first = False
            return self._send(401, "application/json", b"{}")
        if self.server.fail:
            return self._send(500, "text/plain", b"down")
        if "id" not in message:
            return self._send(202, "application/json", b"")
        if message["method"] == "initialize":
            answer = {"jsonrpc": "2.0", "id": message["id"], "result": {"protocolVersion": "2025-06-18"}}
            return self._send(200, "application/json", json.dumps(answer).encode(), session="s-1")
        tools = {"jsonrpc": "2.0", "id": message["id"], "result": {"tools": [{"name": "search"}]}}
        self._send(200, "text/event-stream", f"event: message\ndata: {json.dumps(tools)}\n\n".encode())

    def _send(self, status: int, kind: str, body: bytes, session: str | None = None) -> None:
        self.send_response(status)
        self.send_header("content-type", kind)
        self.send_header("content-length", str(len(body)))
        if session:
            self.send_header("mcp-session-id", session)
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def upstream() -> Iterator[_Upstream]:
    server = _Upstream()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()


def _helper(tmp_path: Path) -> str:
    """A headers helper that mints a new bearer each time it runs."""
    script = tmp_path / "helper.py"
    count = tmp_path / "count"
    script.write_text(
        "import json, pathlib\n"
        f"count = pathlib.Path({str(count)!r})\n"
        "n = int(count.read_text()) + 1 if count.exists() else 1\n"
        "count.write_text(str(n))\n"
        "print(json.dumps({'Authorization': f'Bearer minted-{n}'}))\n"
    )
    return f"{sys.executable} {script}"


def _initialize(n: int = 1) -> bytes:
    return json.dumps({"jsonrpc": "2.0", "id": n, "method": "initialize", "params": {}}).encode() + b"\n"


async def _relayed(config: dict[str, Any], run_env: dict[str, str], *lines: bytes) -> list[dict[str, Any]]:
    """What a session reads back through the bridge for `lines`, one answer per request."""
    relayed = bridge.Bridge(config, run_env=run_env)
    token = relayed.config["mcpServers"]["web"]["env"][bridge.TOKEN_VARIABLE]
    assert relayed.port is not None
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", relayed.port)
        writer.write(f"{token}\n".encode())
        answers = []
        for line in lines:
            writer.write(line)
            await writer.drain()
            if b'"id"' in line:
                answers.append(json.loads(await asyncio.wait_for(reader.readline(), 20)))
        writer.close()
        return answers
    finally:
        await relayed.close()


def _web(upstream: _Upstream, helper: str, **entry: Any) -> dict[str, Any]:
    url = f"http://127.0.0.1:{upstream.server_address[1]}/mcp"
    return {"mcpServers": {"web": {"type": "http", "url": url, "headersHelper": helper, **entry}}}


async def test_the_helper_runs_as_the_app_and_the_session_holds_neither_it_nor_the_url(
    upstream: _Upstream, tmp_path: Path
) -> None:
    config = _web(upstream, _helper(tmp_path), headers={"X-Asker": "${ASKER_TOKEN}"})
    relayed = bridge.Bridge(config, run_env={"ASKER_TOKEN": "one asker's"})
    told = json.dumps(relayed.config)
    await relayed.close()

    answers = await _relayed(config, {"ASKER_TOKEN": "one asker's"}, _initialize())

    assert answers == [{"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "2025-06-18"}}]
    assert upstream.seen[0]["headers"]["Authorization"] == "Bearer minted-1"
    assert upstream.seen[0]["headers"]["X-Asker"] == "one asker's"
    for held in ("headersHelper", "helper.py", str(upstream.server_address[1]), "minted"):
        assert held not in told


async def test_the_servers_session_is_carried_and_an_event_stream_comes_back_as_lines(
    upstream: _Upstream, tmp_path: Path
) -> None:
    initialized = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}).encode() + b"\n"
    tools = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}).encode() + b"\n"

    answers = await _relayed(_web(upstream, _helper(tmp_path)), {}, _initialize(), initialized, tools)

    assert answers[1] == {"jsonrpc": "2.0", "id": 2, "result": {"tools": [{"name": "search"}]}}
    later = [seen for seen in upstream.seen if seen["method"] == "tools/list"]
    assert later[0]["headers"]["mcp-session-id"] == "s-1"
    assert later[0]["headers"]["mcp-protocol-version"] == "2025-06-18"


async def test_a_refused_header_is_minted_again_once(upstream: _Upstream, tmp_path: Path) -> None:
    upstream.refuse_first = True

    answers = await _relayed(_web(upstream, _helper(tmp_path)), {}, _initialize())

    assert answers[0]["result"] == {"protocolVersion": "2025-06-18"}
    posted = [seen["headers"]["Authorization"] for seen in upstream.seen if seen["method"] == "initialize"]
    assert posted == ["Bearer minted-1", "Bearer minted-2"]


async def test_a_server_that_fails_answers_the_request_with_an_error(upstream: _Upstream, tmp_path: Path) -> None:
    upstream.fail = True

    [answer] = await _relayed(_web(upstream, _helper(tmp_path)), {}, _initialize(7))

    assert answer["id"] == 7 and answer["error"]["code"] == -32000


def test_a_helper_that_fails_ends_the_relay_and_says_nothing_it_printed(tmp_path: Path) -> None:
    env = {
        **os.environ,
        remote.URL_VARIABLE: "http://127.0.0.1:1/mcp",
        remote.HELPER_VARIABLE: f"{sys.executable} -c \"print('Bearer leaked'); raise SystemExit(2)\"",
    }

    done = subprocess.run(
        [sys.executable, "-I", "-m", "agent_common.remote"], input=b"", capture_output=True, env=env, timeout=30
    )

    assert done.returncode == 1
    assert b"headers helper failed" in done.stderr and b"leaked" not in done.stderr


def test_an_entrys_own_headers_are_read_one_a_line() -> None:
    assert remote.entry_headers("X-Asker: a: b\nbad line\nAccept-Language: en-AU") == {
        "X-Asker": "a: b",
        "Accept-Language": "en-AU",
    }
