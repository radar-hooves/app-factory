"""A local persona asked, read back and forgotten through the one `Agent` interface."""

import asyncio
import dataclasses
import json
from typing import Any

import pytest
from agent_common import cli
from agent_common.agent import ATTACHMENTS, CHATS, PASSAGES_START, Agent, LocalAgent
from agent_common.persona import Persona


async def _ask(agent: Agent, question: str, **kwargs: Any) -> list[dict[str, Any]]:
    return [event async for event in agent.ask(question, **kwargs)]


def _session(events: list[dict[str, Any]]) -> str:
    return str(next(event for event in events if event.get("subtype") == "init")["session_id"])


def _reported(events: list[dict[str, Any]]) -> dict[str, Any]:
    assistant = next(event for event in events if event.get("type") == "assistant")
    reported: dict[str, Any] = json.loads(assistant["message"]["content"][0]["text"])
    return reported


def _question_sent(events: list[dict[str, Any]]) -> str:
    return str(_reported(events)["question"])


async def test_a_conversation_is_asked_resumed_and_read_back(settings: cli.Settings, milton: Persona) -> None:
    agent: Agent = LocalAgent(settings, milton)

    session = _session(await _ask(agent, "one"))
    assert _session(await _ask(agent, "two", resume=session)) == session

    turns = await agent.read(session)
    assert turns is not None
    assert [turn.question for turn in turns] == ["one", "two"]


async def test_passages_follow_the_question_and_are_taken_back_off_when_it_is_read(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    block = f"{PASSAGES_START}, retrieved for this question:\n\n[1] Pay manual — page 12 (adf-pay)\nRecreation leave accrues."

    events = await _ask(agent, "How much leave?", passages=block)

    sent = _question_sent(events)
    assert sent == f"How much leave?\n\n---\n\n{block}"
    turns = await agent.read(_session(events))
    assert turns is not None
    assert [turn.question for turn in turns] == ["How much leave?"]


async def test_passages_and_attachments_both_come_off_a_question_that_quotes_their_headings(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    asked = f"Explain this heading: {PASSAGES_START}"

    events = await _ask(agent, asked, passages=f"{PASSAGES_START}: none were found.", files={"a.txt": b"a"})

    sent = _question_sent(events)
    assert sent.index("none were found") < sent.index("Attached to this question")
    turns = await agent.read(_session(events))
    assert turns is not None
    assert [turn.question for turn in turns] == [asked]


async def test_passages_still_being_retrieved_reach_a_cli_already_started_on_stdin(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    block = f"{PASSAGES_START}, retrieved for this question:\n\n[1] Pay manual (adf-pay)\nRecreation leave accrues."
    retrieved: asyncio.Future[str] = asyncio.get_running_loop().create_future()
    asking = asyncio.create_task(_ask(agent, "How much leave?", passages=retrieved))
    await asyncio.sleep(0.2)
    retrieved.set_result(block)

    events = await asking

    argv = _reported(events)["argv"]
    assert argv[argv.index("--input-format") + 1] == "stream-json"
    assert "--replay-user-messages" not in argv
    assert _question_sent(events) == f"How much leave?\n\n---\n\n{block}"
    turns = await agent.read(_session(events))
    assert turns is not None
    assert [turn.question for turn in turns] == ["How much leave?"]


async def test_passages_that_fail_end_the_turn_unasked(settings: cli.Settings, milton: Persona) -> None:
    async def unreadable() -> str:
        raise ConnectionError("the library is down")

    with pytest.raises(ConnectionError):
        await _ask(LocalAgent(settings, milton), "How much leave?", passages=unreadable())


async def test_a_cli_gone_before_its_question_is_written_ends_the_turn_with_one_error(
    settings: cli.Settings, milton: Persona
) -> None:
    gone = dataclasses.replace(settings, executable="false")
    retrieved: asyncio.Future[str] = asyncio.get_running_loop().create_future()
    asking = asyncio.create_task(_ask(LocalAgent(gone, milton), "How much leave?", passages=retrieved))
    await asyncio.sleep(0.5)
    retrieved.set_result(f"{PASSAGES_START}: none were found.")

    events = await asking

    assert [(event["type"], event["error"]) for event in events] == [(cli.ERROR_EVENT, "agent exited 1")]


async def test_no_passages_asks_the_question_as_it_is(settings: cli.Settings, milton: Persona) -> None:
    assert _question_sent(await _ask(LocalAgent(settings, milton), "one")) == "one"


async def test_attached_files_are_filed_under_the_conversation_and_named_by_path(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)

    events = await _ask(agent, "what is in these?", files={"../../report.pdf": b"%PDF", "notes.txt": b"hi"})
    session = _session(events)
    folder = milton.home / CHATS / session / ATTACHMENTS
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
    assert not (milton.home / CHATS / session).exists()


@pytest.mark.parametrize("resume", ["../x", "..", "."])
async def test_a_resume_that_is_not_a_session_id_is_refused(
    settings: cli.Settings, milton: Persona, resume: str
) -> None:
    with pytest.raises(ValueError, match="not a session id"):
        await _ask(LocalAgent(settings, milton), "hi", resume=resume)


async def test_a_run_carries_its_askers_variables_in_its_process_and_its_repr_does_not(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton, run_env={"ASKER_TOKEN": "one asker's"})
    events = [event async for event in agent.ask("hi")]
    assistant = next(event for event in events if event.get("type") == "assistant")
    assert json.loads(assistant["message"]["content"][0]["text"])["env"]["ASKER_TOKEN"] == "one asker's"
    assert "one asker's" not in repr(agent)
