"""The sandbox, through a probe run inside it and the spawn every session takes."""

import asyncio
import dataclasses
import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest
from agent_common import cli, sandbox, transcript
from agent_common.agent import ATTACHMENTS, CHATS, LocalAgent
from agent_common.persona import Persona

pytestmark = pytest.mark.skipif(not sandbox.supported(), reason="this kernel's Landlock is below the sandbox's floor")

READ = "__read__"  # fake_claude.py's triggers
MCP = "__mcp__"

#: A stdio server that, asked to `initialize`, answers with the key it was told where to find.
_SERVER = """
import json, os, sys
request = json.loads(sys.stdin.readline())
with open(os.environ["APP_KEY_FILE"]) as handle:
    key = handle.read()
answer = {"key": key, "argv": sys.argv[1:], "cwd": os.getcwd()}
print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": answer}), flush=True)
"""

_PROBE = """
import json, os, socket, sys
results = {}
for name, attempt in (
    ("read granted", lambda: open(sys.argv[1]).read()),
    ("read other", lambda: open(sys.argv[2]).read()),
    ("write granted", lambda: open(sys.argv[3] + "/x", "w").write("x")),
    ("write read-only", lambda: open(sys.argv[1] + ".new", "w").write("x")),
    ("connect allowed", lambda: socket.create_connection(("127.0.0.1", int(sys.argv[4])), 2).close()),
    ("connect other", lambda: socket.create_connection(("127.0.0.1", int(sys.argv[5])), 2).close()),
    ("write /dev/null", lambda: open("/dev/null", "w").write("x")),
    ("write /dev/shm", lambda: open("/dev/shm/agent-sandbox-probe", "w").write("x")),
    ("signal parent", lambda: os.kill(os.getppid(), 0)),
    ("read parent environ", lambda: open(f"/proc/{os.getppid()}/environ").read()),
):
    try:
        attempt()
        results[name] = "ok"
    except PermissionError:
        results[name] = "denied"
print(json.dumps(results))
"""


def test_the_sandbox_confines_reads_writes_and_connections(tmp_path: Path) -> None:
    granted, other, scratch = tmp_path / "granted", tmp_path / "other", tmp_path / "scratch"
    for directory in (granted, other, scratch):
        directory.mkdir()
    (granted / "a.txt").write_text("held")
    (other / "b.txt").write_text("not held")
    allowed, refused = socket.create_server(("127.0.0.1", 0)), socket.create_server(("127.0.0.1", 0))
    ports = [str(server.getsockname()[1]) for server in (allowed, refused)]

    with allowed, refused:
        command = sandbox.confine(
            [sys.executable, "-c", _PROBE, str(granted / "a.txt"), str(other / "b.txt"), str(scratch), *ports],
            read=[granted],
            write=[scratch],
            connect=[int(ports[0])],
        )
        ran = subprocess.run(command, capture_output=True, text=True, timeout=30, check=True)

    assert json.loads(ran.stdout) == {
        "read granted": "ok",
        "read other": "denied",
        "write granted": "ok",
        "write read-only": "denied",
        "connect allowed": "ok",
        "connect other": "denied",
        "write /dev/null": "ok",
        "write /dev/shm": "denied",
        "signal parent": "denied",
        "read parent environ": "denied",
    }


def test_the_launcher_never_runs_a_command_it_could_not_confine(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_landlock(*_args: object) -> None:
        raise OSError("Landlock: Function not implemented")

    def ran(*_args: object) -> None:
        raise AssertionError("the command ran unconfined")

    monkeypatch.setattr(sandbox, "restrict", no_landlock)
    monkeypatch.setattr(os, "execv", ran)

    with pytest.raises(SystemExit) as refused:
        sandbox._main(["--read", "/usr", "--connect", "443", "--exec", "/bin/true", "--", "true"])

    assert refused.value.code == sandbox.REFUSED


async def test_a_session_reads_its_own_folder_and_nothing_else_of_the_app(
    confined: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    job, sibling = tmp_path / "jobs" / "one", tmp_path / "jobs" / "two"
    job.mkdir(parents=True)
    sibling.mkdir()
    (job / "in.txt").write_text("mine")
    (sibling / "in.txt").write_text("another job's")
    secret = tmp_path / "data" / "secret.txt"
    secret.parent.mkdir()
    secret.write_text("the app's")
    other_transcript = milton.home / "projects" / "-another-job" / "s.jsonl"
    other_transcript.parent.mkdir(parents=True)
    other_transcript.write_text("another job's transcript")
    environ = Path(f"/proc/{os.getpid()}/environ")
    paths = [job / "in.txt", sibling / "in.txt", secret, other_transcript, environ]

    events = [event async for event in cli.ask(confined, milton, f"{READ} {' '.join(map(str, paths))}", cwd=job)]

    result = next(event for event in events if event.get("type") == "result")
    assert json.loads(result["result"]) == {
        str(job / "in.txt"): "mine",
        str(sibling / "in.txt"): "denied",
        str(secret): "denied",
        str(other_transcript): "denied",
        str(environ): "denied",
    }


async def test_a_confined_sessions_transcript_lands_where_the_readers_look(
    confined: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    job = tmp_path / "jobs" / "one"
    job.mkdir(parents=True)

    events = [event async for event in cli.ask(confined, milton, "hello", cwd=job, session_id="s-1")]

    assert next(event for event in events if event.get("type") == "result")["is_error"] is False
    turns = transcript.read(milton.home, "s-1")
    assert turns is not None
    assert [turn.question for turn in turns] == ["hello"]


def test_a_session_connects_only_to_its_models_and_its_mcp_servers_ports(
    confined: cli.Settings, milton: Persona
) -> None:
    config = milton.home / ".mcp.json"
    config.write_text(
        json.dumps({"mcpServers": {"web": {"type": "http", "url": "http://mcp.example:8123/mcp"}, "local": {}}})
    )
    gateway = dataclasses.replace(confined, gateway_url="http://gateway.example:4000")

    servers = cli._servers(str(config))
    assert cli._ports(gateway, {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://alloy:4318"}, servers) == [4000, 4318, 8123]
    assert cli._ports(confined, {}, None) == [443]


async def test_the_apps_own_stdio_server_runs_outside_the_session_it_serves(
    confined: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    """The server reads the key it vends with; the session is refused it, and never learns where it is."""
    job = tmp_path / "jobs" / "one"
    job.mkdir(parents=True)
    key = tmp_path / "secrets" / "app.key"
    key.parent.mkdir()
    key.write_text("the app's identity")
    server = tmp_path / "server.py"
    server.write_text(_SERVER)
    entry = {"command": sys.executable, "args": [str(server), "${KIT_TEST_MARKER}"], "env": {"APP_KEY_FILE": str(key)}}
    mcp = {"mcpServers": {"app": {"type": "stdio", **entry, "timeout": 60000}}}
    command = cli.argv(confined, milton, f"{MCP} {key}", mcp_config=job / ".mcp.json")

    process = await cli.spawn(confined, milton, command, cwd=job, run_env={"KIT_TEST_MARKER": "this run's"}, mcp=mcp)
    events = [event async for event in cli.events(process, 30)]
    await process.wait()

    answered = json.loads(next(event for event in events if event.get("type") == "result")["result"])
    assert answered["servers"]["app"]["result"] == {
        "key": "the app's identity",
        "argv": ["this run's"],
        "cwd": str(job),
    }
    assert answered["read"] == {str(key): "denied"}
    relay = json.loads((job / ".mcp.json").read_text())["mcpServers"]["app"]
    assert str(key) not in json.dumps(relay)
    assert relay["type"] == "stdio" and relay["timeout"] == 60000
    port = int(relay["args"][-1])
    for _ in range(50):  # the bridge closes once the session has ended
        try:
            socket.create_connection(("127.0.0.1", port), 1).close()
        except ConnectionRefusedError:
            break
        await asyncio.sleep(0.1)
    else:
        raise AssertionError("the bridge outlived its session")


def test_a_multi_call_binary_is_still_called_by_the_name_it_was_given(tmp_path: Path) -> None:
    """`true` on a Nix host is a symlink to coreutils, which dispatches on argv[0]."""
    command = sandbox.confine(["true", "--version"], read=[tmp_path], write=[], connect=[])

    called = command[command.index("--") + 1 :]
    assert [Path(called[0]).name, *called[1:]] == ["true", "--version"]
    assert subprocess.run(command, capture_output=True, timeout=30).returncode == 0


async def test_one_conversation_of_a_persona_cannot_read_another(
    confined: cli.Settings, milton: Persona, tmp_path: Path
) -> None:
    agent = LocalAgent(confined, milton)
    first = [event async for event in agent.ask("hello", files={"a.txt": b"first's"})]
    mine = next(event["session_id"] for event in first if event.get("subtype") == "init")
    theirs = [event async for event in agent.ask("hello", files={"b.txt": b"second's"})]
    other = next(event["session_id"] for event in theirs if event.get("subtype") == "init")
    other_file = next((milton.home / CHATS / other / ATTACHMENTS).rglob("b.txt"))
    own_file = next((milton.home / CHATS / mine / ATTACHMENTS).rglob("a.txt"))
    transcript_file = transcript.transcript_file(milton.home, other)
    assert transcript_file is not None
    paths = [own_file, other_file, transcript_file, milton.home / "settings.json"]

    resumed = [event async for event in agent.ask(f"{READ} {' '.join(map(str, paths))}", resume=mine)]

    result = next(event for event in resumed if event.get("type") == "result")
    assert json.loads(result["result"]) == {
        str(own_file): "first's",
        str(other_file): "denied",
        str(transcript_file): "denied",
        str(milton.home / "settings.json"): "denied",
    }
