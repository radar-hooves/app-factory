"""Claude Code's own PERSISTED transcript, read back as turns, and forgotten.

A transcript is `<home>/projects/<cwd>/<session_id>.jsonl` — one file per
session, filed under the home `CLAUDE_CONFIG_DIR` pointed at, appended to on
every turn including a `--resume`. It is a different shape from the live
`--output-format stream-json` stdout `cli.ask` forwards: no `system`/`init`
frame and no terminal `result` frame appear in it at all, so a turn boundary
is a fresh `user` event carrying real text and its answer is the prose of the
`assistant` events that follow. Confirmed against production 10/09/2026
(radar-hooves/library#130), where a parser that assumed the stream's frames
silently found nothing in nine live transcripts.

The pure half — `events`, `windows`, `question_of`, `answer_of`, `asked_at` —
opens nothing but the file, so a caller that adds its own reading of a turn
(the library resolves citations through the `cwd` each line records) builds on
them rather than parsing the file again.

A question comes back as the CLI was sent it. Whatever a caller wrapped around
the question on the way in is the caller's to take back off, exactly, against
a string it owns (`agent.LocalAgent` does so for its attachment list); a
heuristic here would be guessing at prose it never wrote.

Lifted from the library's `api/librarian/conversation.py`
(radar-hooves/library), less its citations and attachments. Need:
radar-hooves/cadmus (Nightjar), 30/09/2026.
"""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

#: A session id is used as a FILENAME, so it is checked as one before it
#: reaches a glob. Claude Code mints a UUID; this is the shape that stays a
#: single path segment whatever the CLI mints next.
SESSION_ID = re.compile(r"\A[A-Za-z0-9._-]{1,128}\Z")

#: Where Claude Code files its own transcripts, under its config directory.
PROJECTS = "projects"


@dataclass(frozen=True, slots=True)
class Turn:
    """One question and the prose that answered it.

    `citations` are the sources an agent that cites (the library's Milton)
    resolved for the answer; a local persona's turns carry none.
    """

    question: str
    answer: str
    at: datetime | None
    citations: list[dict[str, Any]] = field(default_factory=list)


def transcript_file(home: Path, session_id: str) -> Path | None:
    """The JSONL this session was written to, or None if there is none.

    Globbed across project directories rather than computed from a working
    directory, because that directory's name is Claude Code's own escaping of
    a path this module would otherwise have to reproduce and keep in step. A
    session resumed from a second working directory leaves a second file; the
    one written to last is the live one.
    """
    if not SESSION_ID.match(session_id):
        return None
    found = [path for path in (home / PROJECTS).glob(f"*/{session_id}.jsonl") if path.is_file()]
    if not found:
        return None
    return max(found, key=lambda path: path.stat().st_mtime)


def read(home: Path, session_id: str) -> list[Turn] | None:
    """Every turn of one conversation, or None if its transcript is gone.

    None and "no such session" are the same answer on purpose: `--resume`
    reads this very file, so a conversation whose transcript has been swept is
    one nobody can continue either, and a consumer that could tell the two
    apart would offer a reader a conversation that cannot be reopened.
    """
    path = transcript_file(home, session_id)
    if path is None:
        return None
    turns: list[Turn] = []
    for window in windows(events(path)):
        question = question_of(window)
        answer = answer_of(window)
        if question is None or answer is None:
            continue
        turns.append(Turn(question=question, answer=answer.strip(), at=asked_at(window)))
    return turns


def forget(home: Path, session_id: str) -> None:
    """Delete this conversation's transcript, wherever the CLI filed it.

    Every file, not the newest: a session resumed from a second working
    directory left a second transcript, and a delete that took one of them
    would leave the conversation readable through the other.
    """
    if not SESSION_ID.match(session_id):
        return
    for path in (home / PROJECTS).glob(f"*/{session_id}.jsonl"):
        path.unlink(missing_ok=True)


def events(path: Path) -> list[dict[str, object]]:
    """Every JSON object line in the transcript, in order.

    A line that is not valid JSON is dropped rather than failing the whole
    file — the same tolerance `cli.events` applies to the live stream, and a
    partly written last line is the ordinary case while a turn is running.
    """
    found: list[dict[str, object]] = []
    for line in path.read_text(errors="replace").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            event = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            found.append(event)
    return found


def windows(entries: list[dict[str, object]]) -> list[list[dict[str, object]]]:
    """Split one session's events at each genuine human question.

    The persisted transcript carries no frame between turns, so a fresh `user`
    event with real text content is the only marker that a new one started.
    A sidechain event belongs to a sub-agent's own loop and is neither a turn
    of this conversation nor part of one.

    Claude Code's own injections are dropped for a sharper reason: it writes
    an auto-compaction summary, and a hook's context, as `user` events, and a
    turn opened on one shows a reader a machine's words under "you asked".
    They carry their own flags, so they are recognised rather than guessed at.
    """
    out: list[list[dict[str, object]]] = []
    current: list[dict[str, object]] = []
    for event in entries:
        if event.get("isSidechain") or event.get("isMeta") or event.get("isCompactSummary"):
            continue
        if _question_text(event) is not None and current:
            out.append(current)
            current = []
        current.append(event)
    if current:
        out.append(current)
    return out


def question_of(window: list[dict[str, object]]) -> str | None:
    """The human turn's own text — the window-opening question, as asked."""
    for event in window:
        text = _question_text(event)
        if text is not None:
            return text
    return None


def answer_of(window: list[dict[str, object]]) -> str | None:
    """Everything the agent said in this turn, in the order it said it.

    An answer routinely arrives as SEVERAL prose blocks with tool calls
    between them — the agent writes half of it, opens another page, and
    writes the rest — and the live surface renders every one of them. A read
    that kept only the last would hand a reader back less than they saw.
    """
    said = [_prose(event) for event in window if event.get("type") == "assistant"]
    joined = "\n\n".join(part for part in said if part)
    return joined or None


def asked_at(window: list[dict[str, object]]) -> datetime | None:
    """When the question was put, from the line's own clock."""
    for event in window:
        if _question_text(event) is None:
            continue
        timestamp = event.get("timestamp")
        if not isinstance(timestamp, str):
            return None
        try:
            return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _question_text(event: dict[str, object]) -> str | None:
    """A genuine human question's text, or None for anything else.

    Including a `user`-typed event that is really a tool result Claude Code
    echoed back under that role: content arrives either as a plain string (a
    real question) or as a list of blocks, where only `text` blocks are prose
    a reader wrote and a `tool_result` block is not.
    """
    if event.get("type") != "user":
        return None
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str) and content.strip():
        return content.strip()
    return _prose(event) or None


def _prose(event: dict[str, object]) -> str:
    """The reader-facing text of one message's blocks, or "" where it has none."""
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, list):
        return ""
    texts = [block.get("text") for block in content if isinstance(block, dict) and block.get("type") == "text"]
    return "\n".join(text for text in texts if isinstance(text, str) and text.strip())
