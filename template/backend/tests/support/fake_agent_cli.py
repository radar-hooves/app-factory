#!/usr/bin/env python3
"""Stand-in for `claude -p ... --output-format stream-json`.

Run as a REAL subprocess by test_agent_api.py (via `AgentSettings.executable`
pointed at this file), so that test exercises the `agent_common` driver's
actual argv and environment construction rather than a mock standing in for it — the "drives
a fake CLI through argv, env, ownership and SSE framing" proof
`docs/design/agent-console.md` asks chunk 1 for.

Speaks just enough of the wire format: one `system`/`init` event carrying a
session id, one `assistant` event whose text ECHOES what this process was
actually invoked with (the question, the tool flags, the MCP config path and
whether `--strict-mcp-config` rode beside it, the model read off
`CLAUDE_CONFIG_DIR/settings.json`, and every telemetry variable the driver's
`environment()` may have set) so the test can assert on argv and env by
reading the stream rather than a side channel, and one `result` event.

`--resume <id>` re-emits that SAME id — the real CLI's own behaviour
`ownership.py`'s docstring measures and is built on — so a resumed turn
claims no new row.

A question of exactly `__crash__` exits 3 having printed nothing, so the
suite can also drive the driver's OWN synthetic error frame (a CLI that dies
badly) rather than only the happy path.

A question of exactly `__giant__` emits one `assistant` frame whose text is
`GIANT_TEXT_SIZE` bytes — comfortably past asyncio's default 64 KiB
`StreamReader` limit — so the suite can drive `ask()`'s own `readline()` loop
against a line actually big enough to raise `ValueError: Separator is found,
but chunk is longer than limit` were `create_subprocess_exec`'s `limit=` not
raised. A real line that size is a `user`/`tool_result` frame carrying many
rows; this fakes the size, not the frame shape, since the size is the whole
defect.

A question of exactly `__mcp_probe__` does something else again: it reads
the `--mcp-config` file this process was handed, runs the one server
entry's `headersHelper` command exactly as the real CLI's own
(Zod-validated) `headersHelper` field is described -- a shell command whose
stdout is a JSON object of header key/value strings -- and makes one real
HTTP GET at the server's `url` with those headers. This is what proves a
persona's `.mcp.json` actually presents the bearer its own MCP server
demands, without depending on the real `claude` binary's own headersHelper
implementation (verified separately, out of this fake CLI's reach, against
the pinned Dockerfile version's own bundled schema).

Every `assistant` frame carries `stop_reason: null`, as every one stream-json
prints does (measured on 2.1.283), and the result line carries
`structured_output` whenever `--json-schema` rode on the argv, exactly as the
real CLI would.

With `--input-format stream-json` on the argv this is a different program,
as the real CLI is (measured on 2.1.283, `stream_json_session` below): the
prompt on the command line is ignored, every `user` frame on stdin is one
turn, `--replay-user-messages` echoes each frame back as its turn starts,
the process stays alive between turns for as long as stdin is open, and it
exits once stdin closes and every frame already read has been answered. Each
turn's frame text is the trigger there. `__hang__` never answers, standing
in for a turn still working when a test stops it; `__chatty_stderr__` writes
past a 64 KiB pipe buffer to stderr before answering, so a run whose stderr
is not drained beside its stdout blocks; `__await_message__` holds its turn
open until the NEXT frame is on stdin, so a test can send a message while a
turn is genuinely still working; `__image__:<path>` answers with a Read of
that file in the real tool-result shape (the image's bytes twice, as the
Messages API block and as the CLI's own `tool_use_result`);
`__secret_stderr__` exits 2 having written a bearer token and a signed URL
to stderr. Every turn appends its frame to a transcript at
`$CLAUDE_CONFIG_DIR/projects/<cwd>/<session>.jsonl`, where the real CLI
keeps one.

A one-shot turn (`-p`) keeps that transcript too, the question as it starts
and the answer once given, as a room reads a conversation back from it.
`__hang__` names the session and then never answers, standing in for a
turn a stop ends. With `fakeAgentPace` in the persona's settings.json
(seconds between words; the driver passes this process no environment of
the test's own, so the persona's home is where it can be said), the answer
is prose streamed a word at a time as `stream_event` deltas before
the whole `assistant` event, as `--include-partial-messages` streams it: a
turn slow enough for a page to be refreshed or stopped under it.
"""

import base64
import json
import os
import re
import select
import subprocess
import sys
import time
import uuid

import httpx

CRASH_TRIGGER = "__crash__"
GIANT_TRIGGER = "__giant__"
#: Well past 65536 (asyncio's default `StreamReader` limit), so this trigger
#: only survives the read loop when `ask()` passes its own `limit=`.
GIANT_TEXT_SIZE = 200_000
MCP_PROBE_TRIGGER = "__mcp_probe__"
HANG_TRIGGER = "__hang__"
CHATTY_STDERR_TRIGGER = "__chatty_stderr__"
AWAIT_MESSAGE_TRIGGER = "__await_message__"
IMAGE_TRIGGER = "__image__:"
SECRET_STDERR_TRIGGER = "__secret_stderr__"
#: How long `__await_message__` holds its turn open for a next frame before answering anyway.
AWAIT_MESSAGE_SECONDS = 5.0
#: Past the 64 KiB default pipe buffer a stderr write blocks on once full.
CHATTY_STDERR_BYTES = 200_000

#: The telemetry variables the driver's `environment()` may pass through
#: or compute, in the order the echo line reports them.
TELEMETRY_VARS = (
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_METRICS_EXPORTER",
    "OTEL_LOGS_EXPORTER",
    "OTEL_RESOURCE_ATTRIBUTES",
    "OTEL_SERVICE_NAME",
)


def _emit(event: dict[str, object]) -> None:
    print(json.dumps(event), flush=True)


def _flag(argv: list[str], name: str) -> str | None:
    return argv[argv.index(name) + 1] if name in argv else None


def _probe_mcp(argv: list[str]) -> dict[str, object]:
    """Run the configured `headersHelper` and call the one server it names."""
    config_path = _flag(argv, "--mcp-config")
    with open(config_path or "") as handle:
        servers = json.load(handle)["mcpServers"]
    name, server = next(iter(servers.items()))

    headers: dict[str, str] = dict(server.get("headers") or {})
    helper = server.get("headersHelper")
    if helper:
        completed = subprocess.run(helper, shell=True, capture_output=True, text=True, check=True)
        headers.update(json.loads(completed.stdout))

    response = httpx.get(server["url"], headers=headers, timeout=5.0)
    return {"server": name, "status_code": response.status_code, "body": response.text}


def _result(session_id: str, text: str, argv: list[str]) -> dict[str, object]:
    """The terminal `result` line, carrying `structured_output` when `--json-schema` was on the argv."""
    result: dict[str, object] = {
        "type": "result",
        "subtype": "success",
        "session_id": session_id,
        "result": text,
        "is_error": False,
    }
    if _flag(argv, "--json-schema") is not None:
        result["structured_output"] = {"text": text}
    return result


def _echo(question: str, argv: list[str]) -> str:
    """This process's own argv and environment, reported back as an assistant's text."""
    config_dir = os.environ.get("CLAUDE_CONFIG_DIR", "")
    settings_path = os.path.join(config_dir, "settings.json") if config_dir else ""
    model = ""
    if settings_path and os.path.isfile(settings_path):
        with open(settings_path) as handle:
            model = json.load(handle).get("model", "")
    return " | ".join(
        [
            f"question={question}",
            f"model={model}",
            f"model_flag={_flag(argv, '--model')}",
            f"resumed={'--resume' in argv}",
            f"pid={os.getpid()}",
            f"ppid={os.getppid()}",
            f"partial={'--include-partial-messages' in argv}",
            f"allowed={_flag(argv, '--allowedTools')}",
            f"disallowed={_flag(argv, '--disallowedTools')}",
            f"mcp_config={_flag(argv, '--mcp-config')}",
            f"strict_mcp_config={'--strict-mcp-config' in argv}",
            f"effort={_flag(argv, '--effort')}",
            f"permission_mode={_flag(argv, '--permission-mode')}",
            f"thinking_off={os.environ.get('MAX_THINKING_TOKENS')}",
            f"append_system_prompt={_flag(argv, '--append-system-prompt')}",
            f"input_format={_flag(argv, '--input-format')}",
            # Present only if the driver leaked the parent's own environment
            # through rather than building the child's from scratch.
            f"marker={os.environ.get('AGENT_TEST_MARKER', 'absent')}",
            "telemetry=" + ",".join(f"{name}={os.environ.get(name, 'absent')}" for name in TELEMETRY_VARS),
        ]
    )


class _Stdin:
    """Stdin read by line off the raw descriptor, so "is another frame waiting" can be asked of it.

    `sys.stdin`'s own buffering reads ahead, and a frame sitting in that
    buffer is invisible to `select()` on the descriptor.
    """

    def __init__(self) -> None:
        self._buffer = b""

    def waiting(self, timeout: float) -> bool:
        if b"\n" in self._buffer:
            return True
        readable, _, _ = select.select([0], [], [], timeout)
        return bool(readable)

    def line(self) -> bytes | None:
        while b"\n" not in self._buffer:
            chunk = os.read(0, 65536)
            if not chunk:
                return None
            self._buffer += chunk
        line, self._buffer = self._buffer.split(b"\n", 1)
        return line


def _assistant(session_id: str, content: list[dict[str, object]]) -> dict[str, object]:
    """An `assistant` event as stream-json prints it: `stop_reason` is null on every one."""
    return {
        "type": "assistant",
        "message": {
            "id": f"msg_{uuid.uuid4().hex[:24]}",
            "type": "message",
            "role": "assistant",
            "model": "fake",
            "content": content,
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1},
        },
        "parent_tool_use_id": None,
        "session_id": session_id,
        "uuid": str(uuid.uuid4()),
    }


def _image_turn(session_id: str, relative: str) -> str:
    """A Read of ``relative`` in the real tool-result shape; returns the closing text."""
    path = os.path.abspath(relative)
    with open(path, "rb") as handle:
        data = base64.b64encode(handle.read()).decode()
    call_id = f"toolu_{uuid.uuid4().hex[:24]}"
    _emit(_assistant(session_id, [{"type": "tool_use", "id": call_id, "name": "Read", "input": {"file_path": path}}]))
    _emit(
        {
            "type": "user",
            "message": {
                "role": "user",
                "content": [
                    {
                        "tool_use_id": call_id,
                        "type": "tool_result",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}
                        ],
                    }
                ],
            },
            "parent_tool_use_id": None,
            "session_id": session_id,
            "uuid": str(uuid.uuid4()),
            "timestamp": "2026-09-29T00:00:00.000Z",
            "tool_use_result": {
                "type": "image",
                "file": {
                    "base64": data,
                    "type": "image/png",
                    "originalSize": len(data),
                    "dimensions": {"originalWidth": 1, "originalHeight": 1, "displayWidth": 1, "displayHeight": 1},
                },
            },
        }
    )
    return f"read {relative}"


def _transcript(session_id: str) -> str:
    folder = os.path.join(
        os.environ.get("CLAUDE_CONFIG_DIR", "."), "projects", re.sub(r"[^A-Za-z0-9]", "-", os.getcwd())
    )
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"{session_id}.jsonl")


def _settings() -> dict[str, object]:
    path = os.path.join(os.environ.get("CLAUDE_CONFIG_DIR", ""), "settings.json")
    if not os.path.isfile(path):
        return {}
    with open(path) as handle:
        loaded: dict[str, object] = json.load(handle)
    return loaded


def _keep(session_id: str, event: dict[str, object]) -> None:
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    with open(_transcript(session_id), "a") as handle:
        handle.write(json.dumps({**event, "session_id": session_id, "timestamp": stamp}) + "\n")


def _paced(session_id: str, question: str, pace: float) -> str:
    """A prose answer, streamed a word at a time."""
    answer = (
        f"You asked: {question}\n\n"
        "Here is a considered answer, written slowly enough to be refreshed, reopened or stopped "
        "part-way through. Everything a person reads arrives first as a stream of small pieces, "
        "then once more whole, as Claude Code itself sends it."
    )
    _emit({"type": "stream_event", "event": {"type": "message_start"}, "session_id": session_id})
    start = {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}
    _emit({"type": "stream_event", "event": start, "session_id": session_id})
    for word in re.findall(r"\S+\s*", answer):
        time.sleep(pace)
        delta = {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": word}}
        _emit({"type": "stream_event", "event": delta, "session_id": session_id})
    return answer


def stream_json_session(argv: list[str]) -> None:
    """The CLI under `--input-format stream-json`: one turn per stdin frame, until stdin closes."""
    session_id = _flag(argv, "--resume") or _flag(argv, "--session-id") or f"fake-{uuid.uuid4().hex[:12]}"
    replay = "--replay-user-messages" in argv
    transcript = os.path.join(
        os.environ.get("CLAUDE_CONFIG_DIR", "."), "projects", re.sub(r"[^A-Za-z0-9]", "-", os.getcwd())
    )
    os.makedirs(transcript, exist_ok=True)
    stdin = _Stdin()
    while (raw := stdin.line()) is not None:
        if not raw.strip():
            continue
        frame = json.loads(raw)
        with open(os.path.join(transcript, f"{session_id}.jsonl"), "a") as handle:
            handle.write(raw.decode() + "\n")
        content = (frame.get("message") or {}).get("content") or []
        text = next((b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"), "")
        if text == CRASH_TRIGGER:
            sys.exit(3)
        if text == SECRET_STDERR_TRIGGER:
            sys.stderr.write(
                "gateway said 401 for Authorization: Bearer sk-live-123 at https://gw.example/v1?sig=abc\n"
            )
            sys.exit(2)
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": "fake", "cwd": os.getcwd()})
        if replay:
            _emit(
                {
                    "type": "user",
                    "message": frame.get("message"),
                    "parent_tool_use_id": None,
                    "session_id": session_id,
                    "uuid": str(uuid.uuid4()),
                    "timestamp": "2026-09-29T00:00:00.000Z",
                    "isReplay": True,
                }
            )
        if text == HANG_TRIGGER:
            time.sleep(3600)
        if text == AWAIT_MESSAGE_TRIGGER:
            stdin.waiting(AWAIT_MESSAGE_SECONDS)
        if text == CHATTY_STDERR_TRIGGER:
            sys.stderr.write("x" * CHATTY_STDERR_BYTES)
            sys.stderr.flush()
        if text == MCP_PROBE_TRIGGER:
            answer = json.dumps(_probe_mcp(argv))
        elif text.startswith(IMAGE_TRIGGER):
            answer = _image_turn(session_id, text.removeprefix(IMAGE_TRIGGER))
        else:
            answer = _echo(text, argv)
        _emit(_assistant(session_id, [{"type": "text", "text": answer}]))
        _emit(_result(session_id, answer, argv))


def main() -> None:
    argv = sys.argv[1:]
    if _flag(argv, "--input-format") == "stream-json":
        stream_json_session(argv)
        return
    question = _flag(argv, "-p") or ""
    if question == CRASH_TRIGGER:
        sys.exit(3)
    resume = _flag(argv, "--resume")
    session_id = resume or _flag(argv, "--session-id") or f"fake-{uuid.uuid4().hex[:12]}"

    if question == GIANT_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        _emit(
            {
                "type": "assistant",
                "message": {"content": [{"type": "text", "text": "x" * GIANT_TEXT_SIZE}], "stop_reason": None},
            }
        )
        _emit({"type": "result", "subtype": "success", "session_id": session_id, "result": "", "is_error": False})
        return

    if question == MCP_PROBE_TRIGGER:
        result = _probe_mcp(argv)
        echo = json.dumps(result)
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": echo}], "stop_reason": None}})
        _emit({"type": "result", "subtype": "success", "session_id": session_id, "result": echo, "is_error": False})
        return

    _keep(session_id, {"type": "user", "message": {"role": "user", "content": question}})
    if question == HANG_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        time.sleep(3600)
    echo = _echo(question, argv)
    model = next(p.removeprefix("model=") for p in echo.split(" | ") if p.startswith("model="))
    _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": model})
    pace = float(str(_settings().get("fakeAgentPace") or 0))
    answer = _paced(session_id, question, pace) if pace else echo
    whole = _assistant(session_id, [{"type": "text", "text": answer}])
    _emit(whole)
    _keep(session_id, whole)
    _emit(_result(session_id, answer, argv))


if __name__ == "__main__":
    main()
