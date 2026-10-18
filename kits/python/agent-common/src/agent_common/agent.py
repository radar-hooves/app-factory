"""The one interface a chat asks through, whichever agent answers.

A person asks an `Agent`, reads a conversation back from it, and forgets one.
Every agent speaks one wire vocabulary: Claude Code's own stream-json events,
verbatim, plus `cli.ERROR_EVENT`, so one page renders any of them and nothing
translates.

`LocalAgent` is a persona this app runs itself, through `cli`. What a
question draws on from the library arrives as `passages` (`collections`), the
app's retrieval, never the agent's.
"""

import asyncio
import shutil
import uuid
from collections.abc import AsyncGenerator, Awaitable, Mapping
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Protocol

from agent_common import cli, transcript
from agent_common.persona import Persona
from agent_common.transcript import Turn

#: Where a local persona keeps its conversations, under its home: one folder
#: per conversation, its session's working directory, so a conversation's
#: session reaches its own folder and no other conversation's.
CHATS = "chats"

#: What a person attached, under the conversation's folder: one folder per turn.
ATTACHMENTS = "attachments"

#: The heading of the block `LocalAgent.ask` appends to a question naming what
#: came with it; `LocalAgent.read` cuts a question at its LAST one.
_ATTACHED = "\n\n---\n\nAttached to this question, to read at these paths:\n"

#: How the passages block (`collections.passages_block`) begins, whichever
#: heading it carries.
PASSAGES_START = "Passages from the collections this person may read"

#: The rule `LocalAgent.ask` puts between a question and the passages block.
_RULE = "\n\n---\n\n"

#: Where the passages block begins; `LocalAgent.read` cuts a question at its LAST one.
_PASSAGED = _RULE + PASSAGES_START


class Agent(Protocol):
    """Ask, read back, forget: all a chat needs of whatever answers it."""

    def ask(
        self,
        question: str,
        *,
        resume: str | None = None,
        files: Mapping[str, bytes] | None = None,
        passages: str | Awaitable[str] | None = None,
    ) -> AsyncGenerator[dict[str, Any]]:
        """Yield the turn's events as they arrive; `resume` continues a conversation, `files` come with the question.

        `passages` is the block the app retrieved for this question
        (`collections.passages_block`), appended to the question for the
        agent to answer from; an awaitable of it is awaited once the agent
        has started, so its start-up and the retrieval run together.

        Closing the generator stops the turn: the local CLI is killed.
        """
        ...

    async def read(self, session: str) -> list[Turn] | None:
        """Every turn of `session`, or None if it is gone."""
        ...

    async def forget(self, session: str) -> None:
        """Delete `session` and everything it holds."""
        ...


@dataclass(frozen=True, slots=True)
class LocalAgent:
    """A persona this app runs itself: `cli` for a turn, `transcript` for the rest.

    `run_env` is what every turn this instance asks carries in its process
    environment and nowhere else (`cli.environment`), such as the asker's
    token: an app builds one instance per request, so it is that asker's.
    """

    settings: cli.Settings
    persona: Persona
    run_env: Mapping[str, str] = field(default_factory=dict, repr=False)

    async def ask(
        self,
        question: str,
        *,
        resume: str | None = None,
        files: Mapping[str, bytes] | None = None,
        passages: str | Awaitable[str] | None = None,
    ) -> AsyncGenerator[dict[str, Any]]:
        """Ask the persona, streaming Claude Code's events verbatim.

        `passages` follow the question under a rule of their own, before the
        attachment list; `read` takes both back off. An awaitable of them
        starts the CLI first and writes the question to it once they resolve
        (`cli.ask`); if it raises, the CLI is ended unasked and the error
        propagates.

        Each conversation runs in a folder of its own under the persona's home
        (`CHATS`), so its session reads and writes that folder and no other
        conversation's. Attached files are written under it and named in the
        question by absolute path, the only way Claude Code's Read tool takes
        a file. The folder is named for the session, so a new conversation has
        its id minted here (`--session-id`).

        Raises:
            ValueError: `resume` is not a session id's shape.
        """
        session = resume or str(uuid.uuid4())
        if not transcript.SESSION_ID.match(session):
            raise ValueError(f"not a session id: {session!r}")
        folder = self.persona.home / CHATS / session
        attached = ""
        if files:
            paths = await asyncio.to_thread(_attach, folder / ATTACHMENTS, files)
            attached = _ATTACHED + "\n".join(f"- {path}" for path in paths)
        else:
            await asyncio.to_thread(folder.mkdir, parents=True, exist_ok=True)

        async def asked(later: Awaitable[str]) -> str:
            return question + _RULE + await later + attached

        whole: str | Awaitable[str] = (
            question + attached
            if not passages
            else question + _RULE + passages + attached
            if isinstance(passages, str)
            else asked(passages)
        )
        async for event in cli.ask(
            self.settings,
            self.persona,
            whole,
            resume=resume,
            session_id=None if resume else session,
            cwd=folder,
            run_env=self.run_env,
        ):
            yield event

    async def read(self, session: str) -> list[Turn] | None:
        """Every turn, each question as the person asked it, less the passages and attachment list `ask` added."""
        turns = await asyncio.to_thread(transcript.read, self.persona.home, session)
        if turns is None:
            return None
        return [replace(turn, question=_unadorned(turn.question)) for turn in turns]

    async def forget(self, session: str) -> None:
        """Delete the transcript and the conversation's folder, its attachments and its scoped home."""
        await asyncio.to_thread(_forget, self.persona.home, session)


def _attach(folder: Path, files: Mapping[str, bytes]) -> list[Path]:
    """Write `files` into a fresh folder under `folder`, by their base names; return their paths."""
    turn = folder / str(uuid.uuid4())
    turn.mkdir(parents=True)
    paths = []
    for name, content in files.items():
        path = turn / (Path(name).name or "attachment")
        path.write_bytes(content)
        paths.append(path)
    return paths


def _unadorned(question: str) -> str:
    """`question` less the attachment list and the passages `LocalAgent.ask` appended.

    Each is cut at its last heading, so a quoted one survives; the attachment
    list went on last, so it comes off first.
    """
    for marker in (_ATTACHED, _PASSAGED):
        head, found, _tail = question.rpartition(marker.strip("\n"))
        if found:
            question = head.rstrip()
    return question


def _forget(home: Path, session: str) -> None:
    transcript.forget(home, session)
    if transcript.SESSION_ID.match(session):
        folder = home / CHATS / session
        for gone in (cli.scope_path(home, folder), cli.transcripts_path(home, folder), folder):
            shutil.rmtree(gone, ignore_errors=True)
