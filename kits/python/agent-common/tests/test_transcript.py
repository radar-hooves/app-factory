"""Turns read back out of Claude Code's persisted transcript, in its own shape."""

import datetime
import json
import os
from pathlib import Path

from agent_common import transcript


def _write(home: Path, session_id: str, lines: list[dict[str, object]], *, project: str = "-work") -> Path:
    folder = home / transcript.PROJECTS / project
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{session_id}.jsonl"
    path.write_text("\n".join(json.dumps(line) for line in lines) + "\n{partial")
    return path


def _user(content: object, **extra: object) -> dict[str, object]:
    return {"type": "user", "message": {"role": "user", "content": content}, **extra}


def _said(*blocks: dict[str, object]) -> dict[str, object]:
    return {"type": "assistant", "message": {"role": "assistant", "content": list(blocks)}}


def _text(text: str) -> dict[str, object]:
    return {"type": "text", "text": text}


def test_a_conversation_reads_back_as_its_turns(tmp_path: Path) -> None:
    _write(
        tmp_path,
        "s1",
        [
            _user("How much leave?", timestamp="2026-09-30T02:00:00.000Z"),
            _said(_text("Let me look."), {"type": "tool_use", "id": "t1", "name": "Read", "input": {}}),
            _user([{"type": "tool_result", "tool_use_id": "t1", "content": "page"}]),
            {"type": "user", "isMeta": True, "message": {"role": "user", "content": "hook context"}},
            {"type": "assistant", "isSidechain": True, "message": {"content": [_text("a sub-agent's aside")]}},
            _said(_text("Four weeks.")),
            {"type": "user", "isCompactSummary": True, "message": {"role": "user", "content": "summary"}},
            _user([_text("And long service?")], timestamp="not a time"),
            _said(_text("Three months.")),
        ],
    )

    turns = transcript.read(tmp_path, "s1")

    assert turns is not None
    assert [(turn.question, turn.answer) for turn in turns] == [
        ("How much leave?", "Let me look.\n\nFour weeks."),
        ("And long service?", "Three months."),
    ]
    assert turns[0].at == datetime.datetime(2026, 9, 30, 2, tzinfo=datetime.UTC)
    assert turns[1].at is None
    assert turns[0].citations == []


def test_a_question_nobody_answered_is_not_a_turn(tmp_path: Path) -> None:
    _write(tmp_path, "s1", [_user("asked"), _said(_text("answered")), _user("still running")])
    turns = transcript.read(tmp_path, "s1")
    assert turns is not None
    assert [turn.question for turn in turns] == ["asked"]


def test_a_gone_or_misshapen_session_reads_as_none(tmp_path: Path) -> None:
    assert transcript.read(tmp_path, "never-written") is None
    assert transcript.read(tmp_path, "../../etc/passwd") is None


def test_the_file_written_last_is_the_live_one(tmp_path: Path) -> None:
    old = _write(tmp_path, "s1", [_user("old"), _said(_text("a"))], project="-first")
    _write(tmp_path, "s1", [_user("new"), _said(_text("b"))], project="-second")
    os.utime(old, (0, 0))

    turns = transcript.read(tmp_path, "s1")
    assert turns is not None
    assert [turn.question for turn in turns] == ["new"]


def test_forget_deletes_every_file_of_that_session_and_nothing_else(tmp_path: Path) -> None:
    first = _write(tmp_path, "s1", [_user("q")], project="-first")
    second = _write(tmp_path, "s1", [_user("q")], project="-second")
    kept = _write(tmp_path, "s2", [_user("q")])

    transcript.forget(tmp_path, "s1")
    transcript.forget(tmp_path, "*")

    assert not first.exists() and not second.exists()
    assert kept.exists()
