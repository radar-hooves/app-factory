"""Run the app's own stdio MCP servers outside a confined session, each reached through a relay.

One Landlock domain covers the CLI and everything it starts, so a stdio server
the CLI starts may read and reach exactly what the session's own `Read` may. A
server that vends its own credentials needs its identity key readable and the
broker's port open, and granting either hands both to the session. So the app
starts the server instead. The session's `.mcp.json` names a relay, a stdlib
process that joins its stdin and stdout to a loopback port the app listens on;
each connection there starts one server, the socket its stdin and stdout, as
the app starts its own processes: in the app's working directory, under the
app's environment and this run's own variables, the server's own `env` over
them and `${VAR}` or `${VAR:-default}` expanded from the same. Never the
session's working directory, home or scratch, which the session writes: a
server reading a module, a `.env` or a config from one would run, unconfined,
whatever the session left there. The port is admitted to that session alone,
and the relay presents a token from its environment, which no other session
can read, so a port reused once the session ends starts nothing for anyone
else; a token starts one server at a time. The session gains the server's
tools and nothing the server holds, not even its `env`.
"""

import asyncio
import contextlib
import hmac
import logging
import os
import re
import secrets
import signal
import socket
import sys
from collections.abc import Mapping
from typing import Any

logger = logging.getLogger(__name__)

#: The relay's environment variable carrying the token that names its server.
TOKEN_VARIABLE = "AGENT_COMMON_RELAY_TOKEN"
_TOKEN_BYTES = 32
#: How long a connection may take to present its token.
_HANDSHAKE_SECONDS = 5.0
#: How long a server has to exit on its own once its session has, before it is killed.
_GRACE_SECONDS = 5.0
#: The keys of a server entry the bridge itself acts on, so never the relay's.
_SERVERS_OWN = ("command", "args", "env", "cwd")
_REFERENCE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")

#: Run as `python -I -c RELAY <port>` inside the session: stdlib only, nothing read off disk.
RELAY = f"""
import os, socket, sys, threading
link = socket.create_connection(("127.0.0.1", int(sys.argv[1])))
link.sendall(os.environ["{TOKEN_VARIABLE}"].encode() + b"\\n")
def up():
    while chunk := os.read(0, 65536):
        link.sendall(chunk)
    link.shutdown(socket.SHUT_WR)
threading.Thread(target=up, daemon=True).start()
while chunk := link.recv(65536):
    sys.stdout.buffer.write(chunk)
    sys.stdout.buffer.flush()
"""


class Bridge:
    """A session's relayed servers: the config its CLI reads, the port its relays reach."""

    def __init__(self, mcp: Mapping[str, Any], *, run_env: Mapping[str, str]) -> None:
        servers = mcp.get("mcpServers")
        servers = servers if isinstance(servers, dict) else {}
        stdio = {
            name: server
            for name, server in servers.items()
            if isinstance(server, dict) and isinstance(server.get("command"), str)
        }
        self._env = {**os.environ, **run_env}
        self._servers: dict[bytes, tuple[str, dict[str, Any]]] = {}
        self._running: dict[bytes, asyncio.subprocess.Process] = {}
        self._connections: set[asyncio.Task[None]] = set()
        self._accepting: asyncio.Task[None] | None = None
        self._listener: socket.socket | None = None
        self.port: int | None = None
        self.config: dict[str, Any] = dict(mcp)
        if not stdio:
            return
        self._listener = socket.create_server(("127.0.0.1", 0))
        self._listener.setblocking(False)
        self.port = self._listener.getsockname()[1]
        relays = {}
        for name, server in stdio.items():
            token = secrets.token_hex(_TOKEN_BYTES // 2)
            self._servers[f"{token}\n".encode()] = (name, server)
            relays[name] = {
                **{key: value for key, value in server.items() if key not in _SERVERS_OWN},
                "command": sys.executable,
                "args": ["-I", "-c", RELAY, str(self.port)],
                "env": {TOKEN_VARIABLE: token},
            }
        self.config["mcpServers"] = {**servers, **relays}
        self._accepting = asyncio.create_task(self._accept(), name=f"mcp-bridge-{self.port}")

    async def close(self) -> None:
        """Stop listening, and end every server it started, given a grace to exit on its own first."""
        for task in [*([self._accepting] if self._accepting else []), *self._connections]:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        if self._listener is not None:
            self._listener.close()
        running = [process for process in self._running.values() if process.returncode is None]
        if running:
            await asyncio.wait([asyncio.create_task(process.wait()) for process in running], timeout=_GRACE_SECONDS)
        for process in running:
            if process.returncode is None:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
                await process.wait()

    async def _accept(self) -> None:
        loop = asyncio.get_running_loop()
        assert self._listener is not None
        while True:
            try:
                connection, _ = await loop.sock_accept(self._listener)
            except OSError:
                logger.exception("MCP bridge %d could not accept a connection; retrying", self.port)
                await asyncio.sleep(1)
                continue
            task = asyncio.create_task(self._serve(loop, connection))
            self._connections.add(task)
            task.add_done_callback(self._connections.discard)

    async def _serve(self, loop: asyncio.AbstractEventLoop, connection: socket.socket) -> None:
        with connection:
            try:
                await self._start(loop, connection)
            except Exception:
                logger.exception("A relayed MCP server could not start")

    async def _start(self, loop: asyncio.AbstractEventLoop, connection: socket.socket) -> None:
        """Start the server whose token `connection` presents, the socket its stdin and stdout."""
        presented = b""
        async with asyncio.timeout(_HANDSHAKE_SECONDS):
            while len(presented) < _TOKEN_BYTES + 1:
                chunk = await loop.sock_recv(connection, _TOKEN_BYTES + 1 - len(presented))
                if not chunk:
                    return
                presented += chunk
        token = next((token for token in self._servers if hmac.compare_digest(token, presented)), None)
        if token is None:
            logger.warning("A connection to MCP bridge %d presented no server's token", self.port)
            return
        name, server = self._servers[token]
        if (running := self._running.get(token)) is not None and running.returncode is None:
            logger.warning("MCP server %r is already running for its session; refused a second", name)
            return
        args, own, cwd = server.get("args"), server.get("env"), server.get("cwd")
        env = {
            **self._env,
            **{k: _expand(str(v), self._env) for k, v in (own if isinstance(own, dict) else {}).items()},
        }
        connection.setblocking(True)
        self._running[token] = await asyncio.create_subprocess_exec(
            _expand(server["command"], self._env),
            *(_expand(str(arg), self._env) for arg in (args if isinstance(args, list) else [])),
            stdin=connection.fileno(),
            stdout=connection.fileno(),
            cwd=_expand(cwd, self._env) if isinstance(cwd, str) else None,
            env=env,
            # Its own process group, as the CLI is, so `close` ends whatever it started too.
            start_new_session=True,
        )
        logger.info("Started MCP server %r outside its session, pid %d", name, self._running[token].pid)


def _expand(value: str, env: Mapping[str, str]) -> str:
    return _REFERENCE.sub(lambda match: env.get(match[1]) or match[2] or "", value)
