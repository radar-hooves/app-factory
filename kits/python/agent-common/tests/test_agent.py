"""A local persona asked, read back and forgotten through the one `Agent` interface."""

import asyncio
import dataclasses
import json
import time
from pathlib import Path
from typing import Any

import pytest
from agent_common import cli, documents, persona
from agent_common.agent import (
    ARTEFACT_EVENT,
    ARTEFACTS,
    ATTACHMENTS,
    CHATS,
    PASSAGES_START,
    TOOLS_BRIEF,
    Agent,
    LocalAgent,
    describe,
)
from agent_common.persona import Persona


async def _ask(agent: Agent, question: str, **kwargs: Any) -> list[dict[str, Any]]:
    return [event async for event in agent.ask(question, **kwargs)]


def _session(events: list[dict[str, Any]]) -> str:
    return str(next(event for event in events if event.get("subtype") == "init")["session_id"])


def _reported(events: list[dict[str, Any]]) -> dict[str, Any]:
    """What the fake CLI said of itself: the text of its last assistant event."""
    assistant = [event for event in events if event.get("type") == "assistant"][-1]
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


async def test_an_agent_asks_on_its_model_and_one_without_leaves_the_persona_its_own(
    settings: cli.Settings, milton: Persona
) -> None:
    routed = _reported(await _ask(LocalAgent(settings, milton, model="credit/sonnet"), "hi"))["argv"]
    assert routed[routed.index("--model") + 1] == "credit/sonnet"
    assert "--model" not in _reported(await _ask(LocalAgent(settings, milton), "hi"))["argv"]


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


async def test_forget_takes_what_the_cli_filed_under_the_session_and_not_another_sessions(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "keep this?"))
    other = _session(await _ask(agent, "and this"))
    for name in (f"todos/{session}-agent-{session}.json", f"file-history/{session}/v1", f"debug/{session}.txt"):
        (milton.home / name).parent.mkdir(parents=True, exist_ok=True)
        (milton.home / name).write_text("x")
    (milton.home / "todos" / f"{other}.json").write_text("x")

    await agent.forget(session)

    assert [path for path in milton.home.rglob("*") if session in str(path)] == []
    assert (milton.home / "todos" / f"{other}.json").exists()


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


# ── documents the agent writes ───────────────────────────────────────────


def _kept(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [event for event in events if event.get("type") == ARTEFACT_EVENT]


async def test_a_document_the_agent_writes_is_kept_as_a_version_and_announced_after_its_result(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)

    events = await _ask(agent, "__write__ brief.md # One")
    session = _session(events)
    [first] = _kept(events)
    resumed = await _ask(agent, "__write__ brief.md # Two", resume=session)

    assert events.index(first) == 1 + next(i for i, event in enumerate(events) if event.get("type") == "user")
    assert first == {
        "type": ARTEFACT_EVENT,
        "name": "brief.md",
        "version": 1,
        "media_type": "text/markdown",
        "bytes": 5,
        "formats": ["docx", "pdf"],
        "title": "One",
        "kind": None,
        "changes": None,
        "pages": 1,
    }
    assert [event["version"] for event in _kept(resumed)] == [2]
    assert await agent.artefact(session, "brief.md", 1) == (b"# One", "text/markdown")
    assert await agent.artefact(session, "brief.md", 2) == (b"# Two", "text/markdown")
    assert await agent.artefact(session, "brief.md", 3) is None


async def test_a_document_without_a_heading_is_titled_by_its_file(settings: cli.Settings, milton: Persona) -> None:
    [kept] = _kept(await _ask(LocalAgent(settings, milton), "__write__ minute-one.md just words"))
    assert (kept["title"], kept["pages"]) == ("minute-one", 1)


def test_front_matter_gives_a_document_its_title_kind_and_changes() -> None:
    text = b"---\ntitle: 'Q3 minute'\nkind: Minute\nchanges: \"added the actions\"\n---\n# Other\n\nBody."
    assert describe(text, "m", "text/markdown") == {
        "title": "Q3 minute",
        "kind": "Minute",
        "changes": "added the actions",
        "pages": 1,
    }


def test_a_heading_titles_a_document_without_front_matter_and_pages_are_counted_in_words() -> None:
    text = ("# The brief\n\n" + "word " * 901).encode()
    assert describe(text, "m", "text/markdown") == {"title": "The brief", "kind": None, "changes": None, "pages": 3}


def test_an_unclosed_front_matter_block_is_text() -> None:
    assert describe(b"---\ntitle: x\nno close", "stem", "text/markdown")["title"] == "stem"


def test_html_is_titled_by_its_title_then_its_heading_and_counted_without_tags() -> None:
    page = b"<html><head><title> A  page </title></head><body><h1>Other</h1><p>one two</p></body></html>"
    assert describe(page, "p", "text/html")["title"] == "A page"
    assert describe(b"<h1>Only <b>this</b></h1>", "p", "text/html")["title"] == "Only this"
    assert describe(b"<p>none</p>", "p", "text/html")["title"] == "p"


def test_a_title_is_bounded() -> None:
    assert len(describe(b"# " + b"x" * 500, "m", "text/markdown")["title"]) == 200


async def test_guidance_follows_the_brief_in_the_system_prompt(settings: cli.Settings, milton: Persona) -> None:
    plain = await _ask(LocalAgent(settings, milton, guidance="SEE THIS"), "hello")
    assert "SEE THIS" in str(_reported(plain))


@pytest.mark.parametrize(
    "question",
    [
        "__write__ notes.txt plain text is the agent's file, not a document",
        "__write__ .hidden.md a dotted name",
        "__fail_write__ brief.md",
    ],
)
async def test_only_a_document_written_into_the_folder_is_kept(
    settings: cli.Settings, milton: Persona, question: str
) -> None:
    events = await _ask(LocalAgent(settings, milton), question)
    assert _kept(events) == []


async def test_a_write_that_lands_outside_the_folder_or_in_its_attachments_is_not_kept(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "hi", files={"a.md": b"theirs"}))
    [turn] = list((milton.home / CHATS / session / ATTACHMENTS).iterdir())
    (milton.home / CHATS / "elsewhere.md").write_text("x")

    attached = await _ask(agent, f"__write__ {ATTACHMENTS}/{turn.name}/a.md mine", resume=session)
    outside = await _ask(agent, "__write__ ../elsewhere.md y", resume=session)

    assert _kept(attached) == [] and _kept(outside) == []
    assert await agent.artefact(session, "../elsewhere.md", 1) is None


async def test_forget_takes_every_version(settings: cli.Settings, milton: Persona) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "__write__ brief.md # One"))

    await agent.forget(session)

    assert not (milton.home / ARTEFACTS / session).exists()


# ── an edited question ───────────────────────────────────────────────────


async def test_keep_takes_the_conversation_back_to_its_first_turns_before_asking(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "one"))
    await _ask(agent, "two", resume=session)

    edited = await _ask(agent, "two, edited", resume=session, keep=1)

    assert "--resume-session-at" in _reported(edited)["argv"]
    turns = await agent.read(session)
    assert turns is not None
    assert [turn.question for turn in turns] == ["one", "two, edited"]


@pytest.mark.parametrize("keep", [0, -1])
async def test_a_conversation_is_never_kept_to_nothing(settings: cli.Settings, milton: Persona, keep: int) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "one"))
    with pytest.raises(ValueError, match="at least one turn"):
        await _ask(agent, "again", resume=session, keep=keep)


async def test_keep_needs_a_conversation_to_take_back(settings: cli.Settings, milton: Persona) -> None:
    with pytest.raises(ValueError, match="at least one turn"):
        await _ask(LocalAgent(settings, milton), "one", keep=1)


# ── what a persona that may look further is told ─────────────────────────


def _armed(root: Path, homes: Path, allow: list[str]) -> Persona:
    directory = root / "armed"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "CLAUDE.md").write_text("You are armed.")
    (directory / "settings.json").write_text(json.dumps({"model": "sonnet", "permissions": {"allow": allow}}))
    return persona.load(root, "armed", homes)


async def test_a_persona_allowed_to_write_is_told_how_to_use_it(settings: cli.Settings, tmp_path: Path) -> None:
    armed = _armed(tmp_path / "personas", tmp_path / "homes", ["Read", "Write"])
    command = _reported(await _ask(LocalAgent(settings, armed), "hi"))["argv"]

    prompt = command[command.index("--append-system-prompt") + 1]

    assert "You are armed." in prompt
    assert TOOLS_BRIEF.splitlines()[0] in prompt
    assert ("Word or PDF" in prompt) is documents.available()


async def test_a_persona_that_only_reads_its_folder_is_told_nothing_more(
    settings: cli.Settings, milton: Persona
) -> None:
    command = _reported(await _ask(LocalAgent(settings, milton), "hi"))["argv"]
    assert TOOLS_BRIEF.splitlines()[0] not in command[command.index("--append-system-prompt") + 1]


# ── a Word file attached ─────────────────────────────────────────────────


async def test_a_word_files_text_is_written_beside_it_and_named_with_it(
    settings: cli.Settings, milton: Persona
) -> None:
    word = documents.render(b"# Leave\n\nTwenty days a year.", "text/markdown", "docx")

    events = await _ask(LocalAgent(settings, milton), "what does this say?", files={"policy.docx": word})
    [turn] = list((milton.home / CHATS / _session(events) / ATTACHMENTS).iterdir())

    assert "Twenty days a year." in (turn / "policy.docx.md").read_text()
    assert f"- {turn / 'policy.docx'} (its text: {turn / 'policy.docx.md'})" in _question_sent(events)


async def test_keep_past_the_turns_the_conversation_holds_is_refused_before_anything_is_asked(
    settings: cli.Settings, milton: Persona
) -> None:
    agent = LocalAgent(settings, milton)
    session = _session(await _ask(agent, "one"))
    with pytest.raises(ValueError, match="no turn 2"):
        await _ask(agent, "again", resume=session, keep=2)
    turns = await agent.read(session)
    assert turns is not None and [turn.question for turn in turns] == ["one"]


async def test_a_document_whose_version_cannot_be_kept_leaves_the_turn_answered(
    settings: cli.Settings, milton: Persona
) -> None:
    long = "é" * 100 + ".md"  # past one path segment once quoted
    events = await _ask(LocalAgent(settings, milton), f"__write__ {long} # Long")
    assert _kept(events) == []
    assert events[-1]["type"] == "result"


async def test_an_attachment_named_for_its_folder_is_filed_as_an_attachment(
    settings: cli.Settings, milton: Persona
) -> None:
    events = await _ask(LocalAgent(settings, milton), "what is this?", files={"..": b"x"})
    [turn] = list((milton.home / CHATS / _session(events) / ATTACHMENTS).iterdir())
    assert [path.name for path in turn.iterdir()] == ["attachment"]


def test_a_page_of_unclosed_tags_is_read_in_one_pass() -> None:
    hostile = b"<script " * 120_000 + b"<title>late</title>"
    started = time.monotonic()
    describe(hostile, "p", "text/html")
    assert time.monotonic() - started < 2


def test_only_the_first_heading_titles_a_page() -> None:
    assert describe(b"<h1>First</h1><h1>Second</h1>", "p", "text/html")["title"] == "First"
