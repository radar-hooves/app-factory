"""A local persona asked, read back and forgotten through the one `Agent` interface."""

import json
from typing import Any

import pytest
from agent_common import cli
from agent_common.agent import ATTACHMENTS, Agent, LocalAgent
from agent_common.persona import Persona


async def _ask(agent: Agent, question: str, **kwargs: Any) -> list[dict[str, Any]]:
    return [event async for event in agent.ask(question, **kwargs)]


def _session(events: list[dict[str, Any]]) -> str:
    return str(next(event for event in events if event.get("subtype") == "init")["session_id"])


def _question_sent(events: list[dict[str, Any]]) -> str:
    assistant = next(event for event in events if event.get("type") == "assistant")
    argv: list[str] = json.loads(assistant["message"]["content"][0]["text"])["argv"]
    return argv[argv.index("-p") + 1]


async def test_a_conversation_is_asked_resumed_and_read_back(settings: cli.Settings, milton: Persona) -> None:
    agent: Agent = LocalAgent(settings, milton)

    session = _session(await _ask(agent, "one"))
    assert _session(await _ask(agent, "two", resume=session)) == session

    turns = await agent.read(session)
    assert turns is not None
    assert [turn.question for turn in turns] == ["one", "two"]


async def test_depth_is_accepted_and_ignored_a_persona_has_no_reading_budget_to_pick(
    settings: cli.Settings, milton: Persona
) -> None:
    agent: Agent = LocalAgent(settings, milton)
    with_depth = _question_sent(await _ask(agent, "one", depth="thorough"))
    without_depth = _question_sent(await _ask(agent, "one"))
    assert with_depth == without_depth == "one"


async def test_attached_files_are_filed_under_the_conversation_and_named_by_path(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)

    events = await _ask(agent, "what is in these?", files={"../../report.pdf": b"%PDF", "notes.txt": b"hi"})
    session = _session(events)
    folder = milton.home / ATTACHMENTS / session
    [turn] = list(folder.iterdir())

    assert (turn / "report.pdf").read_bytes() == b"%PDF"
    assert (turn / "notes.txt").read_bytes() == b"hi"
    sent = _question_sent(events)
    assert sent.startswith("what is in these?\n\n---\n\n")
    assert f"- {turn / 'report.pdf'}" in sent

    turns = await agent.read(session)
    assert turns is not None
    assert [turn.question for turn in turns] == ["what is in these?"]


async def test_forget_takes_the_transcript_and_the_attachments(settings: cli.Settings, milton: Persona) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "keep this?", files={"a.txt": b"a"}))

    await agent.forget(session)

    assert await agent.read(session) is None
    assert not (milton.home / ATTACHMENTS / session).exists()


async def test_files_refuse_a_resume_that_is_not_a_session_id(settings: cli.Settings, milton: Persona) -> None:
    with pytest.raises(ValueError, match="not a session id"):
        await _ask(LocalAgent(settings, milton), "hi", resume="../x", files={"a.txt": b"a"})
