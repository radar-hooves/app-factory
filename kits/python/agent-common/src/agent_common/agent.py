"""The one interface a chat asks through, whichever agent answers.

A person asks an `Agent`, reads a conversation back from it, and forgets one.
Every agent speaks one wire vocabulary: Claude Code's own stream-json events,
verbatim, plus `cli.ERROR_EVENT` (and, from the library, its citation and
suggestion frames), so one page renders any of them and nothing translates.

`LocalAgent` is a persona this app runs itself, through `cli`. The library's
Milton is the other implementation, `library_agent.LibraryAgent`, over the
api-clients `library` client of the library's caller door.
"""

import asyncio
import shutil
import uuid
from collections.abc import AsyncGenerator, Mapping
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal, Protocol

from agent_common import cli, transcript
from agent_common.persona import Persona
from agent_common.transcript import Turn

#: Where a local persona keeps what a person attached, under its home: one
#: folder per conversation, one per turn beneath it.
ATTACHMENTS = "attachments"

#: The heading of the block `LocalAgent.ask` appends to a question naming what
#: came with it; `LocalAgent.read` cuts a question at its LAST one.
_ATTACHED = "\n\n---\n\nAttached to this question, to read at these paths:\n"


class Agent(Protocol):
    """Ask, read back, forget: all a chat needs of whatever answers it."""

    def ask(
        self,
        question: str,
        *,
        resume: str | None = None,
        files: Mapping[str, bytes] | None = None,
        depth: Literal["quick", "thorough"] | None = None,
    ) -> AsyncGenerator[dict[str, Any]]:
        """Yield the turn's events as they arrive; `resume` continues a conversation, `files` come with the question.

        `depth` is Milton's alone: a local persona has no reading budget or
        model to pick between, so `LocalAgent` takes and ignores it.

        Closing the generator stops the turn: the local CLI is killed, the
        library's stream closed.
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
    """A persona this app runs itself: `cli` for a turn, `transcript` for the rest."""

    settings: cli.Settings
    persona: Persona

    async def ask(
        self,
        question: str,
        *,
        resume: str | None = None,
        files: Mapping[str, bytes] | None = None,
        depth: Literal["quick", "thorough"] | None = None,
    ) -> AsyncGenerator[dict[str, Any]]:
        """Ask the persona, streaming Claude Code's events verbatim.

        `depth` is ignored: a persona's model and behaviour are fixed in its
        own `settings.json`, so there is nothing here for it to pick between.

        Attached files are written under the persona's home and named in the
        question by absolute path, the only way Claude Code's Read tool takes
        a file. So they can be filed under their conversation, a new
        conversation with files has its id minted here (`--session-id`);
        without files the CLI mints it, as it always has.

        Raises:
            ValueError: `files` came with a `resume` that is not a session id's shape.
        """
        session_id = None
        if files:
            session = resume or str(uuid.uuid4())
            if not transcript.SESSION_ID.match(session):
                raise ValueError(f"not a session id: {session!r}")
            session_id = None if resume else session
            paths = await asyncio.to_thread(_attach, self.persona.home / ATTACHMENTS / session, files)
            question = question + _ATTACHED + "\n".join(f"- {path}" for path in paths)
        async for event in cli.ask(self.settings, self.persona, question, resume=resume, session_id=session_id):
            yield event

    async def read(self, session: str) -> list[Turn] | None:
        """Every turn, each question as the person asked it, less the attachment list `ask` added."""
        turns = await asyncio.to_thread(transcript.read, self.persona.home, session)
        if turns is None:
            return None
        return [replace(turn, question=_unattached(turn.question)) for turn in turns]

    async def forget(self, session: str) -> None:
        """Delete the transcript and every file attached to the conversation."""
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


def _unattached(question: str) -> str:
    """`question` less the block `LocalAgent.ask` appended, cut at the last heading so a quoted one survives."""
    head, marker, _tail = question.rpartition(_ATTACHED.strip("\n"))
    return head.rstrip() if marker else question


def _forget(home: Path, session: str) -> None:
    transcript.forget(home, session)
    if transcript.SESSION_ID.match(session):
        shutil.rmtree(home / ATTACHMENTS / session, ignore_errors=True)
