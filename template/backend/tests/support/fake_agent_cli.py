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
`CLAUDE_CONFIG_DIR/settings.json`) so the test can assert on argv and env by
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
"""

import json
import os
import sys
import uuid

CRASH_TRIGGER = "__crash__"
GIANT_TRIGGER = "__giant__"
#: Well past 65536 (asyncio's default `StreamReader` limit), so this trigger
#: only survives the read loop when `ask()` passes its own `limit=`.
GIANT_TEXT_SIZE = 200_000


def _emit(event: dict[str, object]) -> None:
    print(json.dumps(event), flush=True)


def _flag(argv: list[str], name: str) -> str | None:
    return argv[argv.index(name) + 1] if name in argv else None


def main() -> None:
    argv = sys.argv[1:]
    question = _flag(argv, "-p") or ""
    if question == CRASH_TRIGGER:
        sys.exit(3)
    resume = _flag(argv, "--resume")
    session_id = resume or f"fake-{uuid.uuid4().hex[:12]}"

    if question == GIANT_TRIGGER:
        _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": ""})
        _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": "x" * GIANT_TEXT_SIZE}]}})
        _emit({"type": "result", "subtype": "success", "session_id": session_id, "result": "", "is_error": False})
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
            # Present only if session.py leaked the parent's own environment
            # through rather than building the child's from scratch.
            f"marker={os.environ.get('AGENT_TEST_MARKER', 'absent')}",
        ]
    )

    _emit({"type": "system", "subtype": "init", "session_id": session_id, "model": model})
    _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": echo}]}})
    _emit({"type": "result", "subtype": "success", "session_id": session_id, "result": echo, "is_error": False})


if __name__ == "__main__":
    main()
