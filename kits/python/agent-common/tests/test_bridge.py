"""The bridge, without a kernel's Landlock: what a connection must present, and what the CLI is told."""

import asyncio
import json
import sys
from pathlib import Path

import pytest
from agent_common import bridge, cli
from agent_common.persona import Persona


def _bridge(server: Path) -> bridge.Bridge:
    return bridge.Bridge({"mcpServers": {"app": {"command": sys.executable, "args": [str(server)]}}}, run_env={})


async def test_a_connection_without_a_servers_token_starts_nothing(tmp_path: Path) -> None:
    started = tmp_path / "started"
    server = tmp_path / "server.py"
    server.write_text(f"open({str(started)!r}, 'w').close()")
    relayed = _bridge(server)
    assert relayed.port is not None
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", relayed.port)
        writer.write(b"0" * 32 + b"\n")
        await writer.drain()

        assert await asyncio.wait_for(reader.read(), 10) == b""
        assert not started.exists()
        writer.close()
    finally:
        await relayed.close()


async def test_a_token_starts_one_server_at_a_time(tmp_path: Path) -> None:
    """Two connections presenting one token at once start one server; the other is closed."""
    starts = tmp_path / "starts"
    server = tmp_path / "server.py"
    server.write_text(f"import sys\nopen({str(starts)!r}, 'a').write('started\\n')\nsys.stdin.read()")
    relayed = _bridge(server)
    token = relayed.config["mcpServers"]["app"]["env"][bridge.TOKEN_VARIABLE]
    assert relayed.port is not None
    try:
        connections = [await asyncio.open_connection("127.0.0.1", relayed.port) for _ in range(2)]
        for _, writer in connections:
            writer.write(f"{token}\n".encode())
        await asyncio.gather(*(writer.drain() for _, writer in connections))

        reads = [asyncio.create_task(reader.read()) for reader, _ in connections]
        done, pending = await asyncio.wait(reads, timeout=10, return_when=asyncio.FIRST_COMPLETED)
        assert [task.result() for task in done] == [b""]
        await asyncio.sleep(0.5)
        assert starts.read_text() == "started\n"
        for task in pending:
            task.cancel()
        for _, writer in connections:
            writer.close()
    finally:
        await relayed.close()


async def test_a_config_with_no_stdio_server_is_left_as_it_is() -> None:
    mcp = {"mcpServers": {"web": {"type": "http", "url": "http://mcp.example:8123/mcp"}}}

    relayed = bridge.Bridge(mcp, run_env={})

    assert (relayed.config, relayed.port) == (mcp, None)
    await relayed.close()


async def test_unconfined_the_apps_config_is_written_as_it_is(
    settings: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    mcp = {"mcpServers": {"app": {"command": "some-server", "env": {"APP_KEY_FILE": "/secrets/app.key"}}}}
    command = cli.argv(settings, milton, "hello", mcp_config=tmp_path / ".mcp.json")

    process = await cli.spawn(settings, milton, command, cwd=tmp_path, mcp=mcp)
    await process.communicate()

    assert json.loads((tmp_path / ".mcp.json").read_text()) == mcp


async def test_the_apps_config_is_written_only_into_the_sessions_own_folder(
    settings: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    command = cli.argv(settings, milton, "hello", mcp_config=tmp_path / "elsewhere" / ".mcp.json")

    with pytest.raises(ValueError, match="must name a file in `cwd`"):
        await cli.spawn(settings, milton, command, cwd=tmp_path, mcp={"mcpServers": {}})
