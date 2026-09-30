#!/usr/bin/env python3
"""Stand-in for `claude -p <question> --output-format stream-json`, run as a real subprocess.

Emits `system`/`init`, one `assistant` event whose text is a JSON object of
this process's own argv and the environment names the driver decides, and a
`result`; and appends the turn to `$CLAUDE_CONFIG_DIR/projects/<cwd>/<id>.jsonl`
in the persisted transcript's own shape, as the real CLI does. `--resume` and
`--session-id` both name the session it reports. A question that is one of
the triggers below misbehaves instead, the way a real CLI sometimes does.
"""

import json
import os
import re
import sys
import time
import uuid

CRASH = "__crash__"
HANG = "__hang__"
CHATTY = "__chatty__"
GIANT = "__giant__"
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


def main() -> None:
    argv = sys.argv[1:]
    question = _flag(argv, "-p") or ""
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
        else json.dumps({"argv": argv, "cwd": os.getcwd(), "env": {name: os.environ.get(name) for name in ENV_NAMES}})
    )

    print("a diagnostic line that is not JSON", flush=True)
    _emit({"type": "system", "subtype": "init", "session_id": session_id, "cwd": os.getcwd()})
    _emit({"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}, "session_id": session_id})
    _emit({"type": "result", "subtype": "success", "session_id": session_id, "result": text, "is_error": False})

    folder = os.path.join(os.environ["CLAUDE_CONFIG_DIR"], "projects", re.sub(r"[^A-Za-z0-9]", "-", os.getcwd()))
    os.makedirs(folder, exist_ok=True)
    stamp = "2026-09-30T02:00:00.000Z"
    with open(os.path.join(folder, f"{session_id}.jsonl"), "a") as handle:
        for line in (
            {"type": "user", "message": {"role": "user", "content": question}, "cwd": os.getcwd(), "timestamp": stamp},
            {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}},
        ):
            handle.write(json.dumps(line) + "\n")


if __name__ == "__main__":
    main()
