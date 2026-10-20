#!/usr/bin/env python3
"""Stand-in for `claude -p <question> --output-format stream-json`, run as a real subprocess.

With `--input-format stream-json` the question is the one `user` frame read
off stdin instead, as the real CLI takes it.

Emits `system`/`init`, one `assistant` event whose text is a JSON object of
this process's own argv and the environment names the driver decides, and a
`result`; and appends the turn to `$CLAUDE_CONFIG_DIR/projects/<cwd>/<id>.jsonl`
in the persisted transcript's own shape, as the real CLI does. `--resume` and
`--session-id` both name the session it reports. A question that is one of
the triggers below misbehaves instead, the way a real CLI sometimes does.
`__mcp__ <path>...` starts each stdio server its `--mcp-config` names, as the
real CLI does (its environment under the server's own `env`, in its `cwd`),
asks each to `initialize`, and reports their answers beside what this process
could read of each path. `__write__ <path> <text>` writes `text` to `path`
under its working directory by a `Write` step, its `tool_use` and its
`tool_result`, as the real CLI reports one; `__fail_write__ <path>` reports
a `Write` that failed. `__connect__ <port>...` reports whether this process
could open a TCP connection to each port on the loopback. Each transcript line carries a `uuid` and the
`parentUuid` of the line before it, or of `--resume-session-at`'s message.
"""

import json
import os
import re
import socket
import subprocess
import sys
import time
import uuid

CRASH = "__crash__"
HANG = "__hang__"
CHATTY = "__chatty__"
GIANT = "__giant__"
READ = "__read__"
MCP = "__mcp__"
WRITE = "__write__"
FAIL_WRITE = "__fail_write__"
CONNECT = "__connect__"
GIANT_SIZE = 200_000
ENV_NAMES = (
    "HOME",
    "CLAUDE_CONFIG_DIR",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "MAX_THINKING_TOKENS",
    "OTEL_SERVICE_NAME",
    "KIT_TEST_MARKER",
    "ASKER_TOKEN",
)


def _flag(argv: list[str], name: str) -> str | None:
    return argv[argv.index(name) + 1] if name in argv else None


def _emit(event: dict[str, object]) -> None:
    print(json.dumps(event), flush=True)


def _read_each(paths: list[str]) -> str:
    """What this process could read of each path, or `denied`: the confinement, seen from inside."""
    seen = {}
    for path in paths:
        try:
            with open(path) as handle:
                seen[path] = handle.read()
        except PermissionError:
            seen[path] = "denied"
    return json.dumps(seen)


def _connect_each(ports: list[str]) -> str:
    """Whether this process could connect to each loopback port, or `denied`."""
    seen = {}
    for port in ports:
        try:
            socket.create_connection(("127.0.0.1", int(port)), 2).close()
            seen[port] = "ok"
        except PermissionError:
            seen[port] = "denied"
    return json.dumps(seen)


def _initialize_each(argv: list[str]) -> dict[str, object]:
    """Each stdio server's answer to `initialize`, started as the real CLI starts one."""
    with open(_flag(argv, "--mcp-config") or "") as handle:
        servers = json.load(handle)["mcpServers"]
    answers = {}
    for name, server in servers.items():
        started = subprocess.Popen(
            [server["command"], *server.get("args", [])],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            env={**os.environ, **server.get("env", {})},
        )
        assert started.stdin is not None and started.stdout is not None
        started.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}).encode() + b"\n")
        started.stdin.flush()
        answers[name] = json.loads(started.stdout.readline() or "null")
        started.stdin.close()
        started.wait(timeout=10)
    return answers


def _stdin_question() -> str:
    """The text of the `user` frames on stdin, read to its end."""
    texts = []
    for line in sys.stdin:
        frame = json.loads(line)
        texts += [block["text"] for block in frame["message"]["content"] if block.get("type") == "text"]
    return "\n".join(texts)


def main() -> None:
    argv = sys.argv[1:]
    question = _stdin_question() if _flag(argv, "--input-format") == "stream-json" else _flag(argv, "-p") or ""
    if question == CRASH:
        sys.stderr.write("gateway said 401 for Authorization: Bearer sk-live-123 at https://gw.example/v1?sig=abc\n")
        sys.exit(3)
    if question == HANG:
        time.sleep(60)
    if question == CHATTY:
        sys.stderr.write("x" * 200_000)
        sys.stderr.flush()
    session_id = _flag(argv, "--resume") or _flag(argv, "--session-id") or str(uuid.uuid4())
    text = (
        "x" * GIANT_SIZE
        if question == GIANT
        else _read_each(question.split()[1:])
        if question.startswith(READ)
        else _connect_each(question.split()[1:])
        if question.startswith(CONNECT)
        else json.dumps({"servers": _initialize_each(argv), "read": json.loads(_read_each(question.split()[1:]))})
        if question.startswith(MCP)
        else json.dumps(
            {
                "argv": argv,
                "question": question,
                "cwd": os.getcwd(),
                "env": {name: os.environ.get(name) for name in ENV_NAMES},
            }
        )
    )

    print("a diagnostic line that is not JSON", flush=True)
    _emit({"type": "system", "subtype": "init", "session_id": session_id, "cwd": os.getcwd()})
    words = question.split(maxsplit=2)
    if words and words[0] in (WRITE, FAIL_WRITE):
        target = os.path.join(os.getcwd(), words[1])
        if words[0] == WRITE:
            with open(target, "w") as handle:
                handle.write(words[2] if len(words) > 2 else "")
        call = {"type": "tool_use", "id": "toolu_write", "name": "Write", "input": {"file_path": target}}
        _emit({"type": "assistant", "message": {"content": [call]}, "session_id": session_id})
        outcome: dict[str, object] = {"type": "tool_result", "tool_use_id": "toolu_write", "content": "done"}
        if words[0] == FAIL_WRITE:
            outcome["is_error"] = True
        _emit({"type": "user", "message": {"content": [outcome]}, "session_id": session_id})
    _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}, "session_id": session_id})
    _emit({"type": "result", "subtype": "success", "session_id": session_id, "result": text, "is_error": False})

    folder = os.path.join(os.environ["CLAUDE_CONFIG_DIR"], "projects", re.sub(r"[^A-Za-z0-9]", "-", os.getcwd()))
    os.makedirs(folder, exist_ok=True)
    stamp = "2026-09-30T02:00:00.000Z"
    path = os.path.join(folder, f"{session_id}.jsonl")
    parent = _flag(argv, "--resume-session-at") or _last_uuid(path)
    with open(path, "a") as handle:
        lines: list[dict[str, object]] = [
            {"type": "user", "message": {"role": "user", "content": question}, "cwd": os.getcwd(), "timestamp": stamp},
            {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}},
        ]
        for line in lines:
            line["uuid"] = minted = str(uuid.uuid4())
            line["parentUuid"] = parent
            parent = minted
            handle.write(json.dumps(line) + "\n")


def _last_uuid(path: str) -> str | None:
    """The `uuid` of the transcript's last line, the parent of the next."""
    try:
        with open(path) as handle:
            lines = handle.read().splitlines()
    except FileNotFoundError:
        return None
    return json.loads(lines[-1]).get("uuid") if lines else None


if __name__ == "__main__":
    main()
