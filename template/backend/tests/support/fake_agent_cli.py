#!/usr/bin/env python3
"""Stand-in for `claude -p ... --output-format stream-json`.

Run as a REAL subprocess by test_agent_api.py (via `AgentSettings.executable`
pointed at this file), so that test exercises session.py's actual argv and
environment construction rather than a mock standing in for it — the "drives
a fake CLI through argv, env, ownership and SSE framing" proof
`docs/design/agent-console.md` asks chunk 1 for.

Speaks just enough of the wire format: one `system`/`init` event carrying a
session id, one `assistant` event whose text ECHOES what this process was
actually invoked with (the question, the tool flags, the MCP config path and
whether `--strict-mcp-config` rode beside it, the model read off
`CLAUDE_CONFIG_DIR/settings.json`, and every telemetry variable `session.py`'s
`_environment()` may have set) so the test can assert on argv and env by
reading the stream rather than a side channel, and one `result` event.

`--resume <id>` re-emits that SAME id — the real CLI's own behaviour
`ownership.py`'s docstring measures and is built on — so a resumed turn
claims no new row.

A question of exactly `__crash__` exits 3 having printed nothing, so the
suite can also drive session.py's OWN synthetic error frame (a CLI that dies
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

Several more triggers stand in for what `jobs.py`'s tests need that none of
the above does. `__await_stdin__` blocks on ONE line of stream-json input
before answering -- `jobs.send_message()`'s live-stdin path writes it -- and
`__hang__` blocks forever, standing in for a turn still genuinely working
when `jobs.stop()` kills it. `__chatty_stderr__` writes well past a 64 KiB
pipe buffer to stderr WITHOUT anything reading stdout in between, proving
stderr is drained concurrently rather than only after stdout closes.

`__partial__` models `--include-partial-messages` as the real, installed CLI
(2.1.283) actually emits it -- measured directly, not guessed, against this
module's own `build_argv` flags: token deltas arrive as their own top-level
`type: "stream_event"` line (wrapping the raw Anthropic streaming sub-events
-- `message_start`, `content_block_delta`, `message_stop`), and the ONE
settled `assistant` frame that follows carries `message.stop_reason: null`
JUST LIKE EVERY OTHER assistant frame this fake CLI emits below -- that field
is never a "still growing" signal on the real wire, which is exactly why
`jobs.py`'s `_is_partial()` keys on `type == "stream_event"` alone and
persists every `assistant`/`user`/`system`/`result` frame regardless of its
`stop_reason`. `stop_reason: null` is therefore the DEFAULT below, not a
special case for one trigger.
"""

import json
import os
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
AWAIT_STDIN_TRIGGER = "__await_stdin__"
HANG_TRIGGER = "__hang__"
PARTIAL_TRIGGER = "__partial__"
CHATTY_STDERR_TRIGGER = "__chatty_stderr__"
#: Past the 64 KiB default pipe buffer a stderr write blocks on once full.
CHATTY_STDERR_BYTES = 200_000

#: The telemetry variables `session.py`'s `_environment()` may pass through
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


def main() -> None:
    argv = sys.argv[1:]
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

    if question == HANG_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        # Killed by the test (`jobs.stop()`), never exits on its own -- stands
        # in for a turn genuinely still working.
        time.sleep(3600)
        return

    if question == AWAIT_STDIN_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        line = sys.stdin.readline()
        frame = json.loads(line) if line.strip() else {}
        content = (frame.get("message") or {}).get("content") or []
        text = next((b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"), "")
        echo = f"stdin: {text}"
        _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": echo}], "stop_reason": None}})
        _emit(_result(session_id, echo, argv))
        return

    if question == PARTIAL_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        message_id = f"msg-{uuid.uuid4().hex[:8]}"
        final_text = "growing, then settled"
        # Three `stream_event` deltas -- the shape measured against the real
        # CLI: message_start, one content_block_delta per token-ish chunk,
        # message_stop. These are what a LIVE watcher sees arrive one at a
        # time; `jobs.py` never persists a `stream_event` line.
        _emit({"type": "stream_event", "event": {"type": "message_start", "message": {"id": message_id}}})
        _emit(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "growing"},
                },
            }
        )
        _emit(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": ", then settled"},
                },
            }
        )
        _emit({"type": "stream_event", "event": {"type": "message_stop"}})
        # The ONE settled `assistant` frame -- carrying `stop_reason: null`
        # exactly like every other assistant frame this fake CLI emits, never
        # a special "I am final" marker. `jobs.py` persists this one.
        _emit(
            {
                "type": "assistant",
                "message": {"id": message_id, "content": [{"type": "text", "text": final_text}], "stop_reason": None},
            }
        )
        _emit(_result(session_id, final_text, argv))
        return

    if question == CHATTY_STDERR_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        # Written before the reply, and before this process's own stdout is
        # read again -- if stderr is not drained concurrently, this write
        # blocks once the pipe buffer fills, and the stdout line below never
        # arrives until something reads stderr.
        sys.stderr.write("x" * CHATTY_STDERR_BYTES)
        sys.stderr.flush()
        echo = "survived a chatty stderr"
        _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": echo}], "stop_reason": None}})
        _emit(_result(session_id, echo, argv))
        return

    config_dir = os.environ.get("CLAUDE_CONFIG_DIR", "")
    settings_path = os.path.join(config_dir, "settings.json") if config_dir else ""
    model = ""
    if settings_path and os.path.isfile(settings_path):
        with open(settings_path) as handle:
            model = json.load(handle).get("model", "")

    echo = " | ".join(
        [
            f"question={question}",
            f"model={model}",
            f"allowed={_flag(argv, '--allowedTools')}",
            f"disallowed={_flag(argv, '--disallowedTools')}",
            f"mcp_config={_flag(argv, '--mcp-config')}",
            f"strict_mcp_config={'--strict-mcp-config' in argv}",
            f"effort={_flag(argv, '--effort')}",
            f"permission_mode={_flag(argv, '--permission-mode')}",
            f"thinking_off={os.environ.get('MAX_THINKING_TOKENS')}",
            f"append_system_prompt={_flag(argv, '--append-system-prompt')}",
            f"input_format={_flag(argv, '--input-format')}",
            # Present only if session.py leaked the parent's own environment
            # through rather than building the child's from scratch.
            f"marker={os.environ.get('AGENT_TEST_MARKER', 'absent')}",
            "telemetry=" + ",".join(f"{name}={os.environ.get(name, 'absent')}" for name in TELEMETRY_VARS),
        ]
    )

    _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": model})
    _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": echo}], "stop_reason": None}})
    _emit(_result(session_id, echo, argv))


if __name__ == "__main__":
    main()
