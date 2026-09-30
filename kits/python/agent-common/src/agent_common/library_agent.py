"""Milton over a room's collections: the library's caller door as an `Agent`.

The library's `/api/caller` mount streams Claude Code's own stream-json events
verbatim, plus four frames of its own (`citations`, `suggestions`,
`library_error`, `queued`): the one vocabulary `@poodle64/librarian`'s
Transcript folds, so every frame is passed on as it arrives and nothing is
translated. Everything goes through api-clients' typed `library` client:
`AskStreamClient` for the stream, `CallerApi` for the rest.

The kit holds no credential. The consumer vends the app's caller bearer
(`config/vend.py`) and hands in `token`, awaited before every call, so a
refreshed bearer reaches the next request.

A room's preamble rides in the question as `{preamble}\\n\\n{question}` until
the library takes it as a field of its own (`docs/design/agent-console.md`
§Needs): `ask` adds it and `read` takes it back off by exact prefix, the same
contract `LocalAgent` keeps for its attachment list and the library keeps for
its own.

Need: radar-hooves/cadmus (Nightjar), 30/09/2026.
"""

import asyncio
import contextlib
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

from library import CallerAnswerFeedbackRequest, CallerApi, Configuration
from library.exceptions import NotFoundException
from library.wrappers import AskAttachment, AskStreamClient, EnhancedApiClient, LibraryError

from agent_common import cli
from agent_common.transcript import Turn

#: Between a room's preamble and the question it introduces, on the wire.
_PREAMBLE_END = "\n\n"


@dataclass(frozen=True, slots=True)
class Document:
    """A cited document as a reading pane opens it: `@poodle64/librarian`'s `LoadedDocument`.

    Each section is `anchor`, `heading` and `text`; `anchor` is what a
    citation carries. The library's hashes, locations and index statuses are
    its own bookkeeping and stop here.
    """

    title: str
    sections: list[dict[str, str]]


@dataclass(frozen=True, slots=True)
class LibraryAgent:
    """Milton, asked over one room's collections through the library's caller door.

    `url` is the caller mount (`https://library.example/api/caller`).
    `collections` are the room's, never the browser's; the library narrows
    them to the app's caller grant. `timeout_seconds` is an IDLE timeout, as
    `cli.Settings.timeout_seconds` is: the library repeats `queued` at least
    every 30 s, so a question waiting behind another does not trip it.

    `mark` and `document` are a library room's alone and not on `Agent`.
    """

    url: str
    collections: Sequence[str]
    token: Callable[[], Awaitable[str]] = field(repr=False)
    preamble: str = ""
    timeout_seconds: float = 600.0

    async def ask(
        self, question: str, *, resume: str | None = None, files: Mapping[str, bytes] | None = None
    ) -> AsyncGenerator[dict[str, Any]]:
        """Ask Milton, yielding every frame the library sends, unaltered, as it arrives.

        The library itself answers a foreign resume or an out-of-scope ask
        with a `library_error` frame. A refused request, a lost connection or
        silence past the idle timeout ends the turn with one `cli.ERROR_EVENT`
        frame of the same shape, as a local persona's failed spawn does.
        Closing the generator closes the stream, on which the library kills
        Milton's process.
        """
        attachments = [
            AskAttachment(filename=Path(name).name or "attachment", content=content)
            for name, content in (files or {}).items()
        ]
        configuration = await self._configuration()
        try:
            async with AskStreamClient(configuration) as client:
                # An async generator, annotated as the iterator it is, closed
                # explicitly below so the connection goes with it.
                frames = cast(
                    AsyncGenerator[dict[str, Any]],
                    client.ask(self._asked(question), list(self.collections), resume=resume, files=attachments or None),
                )
                try:
                    while True:
                        async with asyncio.timeout(self.timeout_seconds):
                            frame = await anext(frames, None)
                        if frame is None:
                            return
                        yield frame
                finally:
                    await frames.aclose()
        except TimeoutError:
            yield {"type": cli.ERROR_EVENT, "error": "agent exceeded its wall clock"}
        except LibraryError as exc:
            error = f"library answered HTTP {exc.status_code}" if exc.status_code else "library connection lost"
            yield {"type": cli.ERROR_EVENT, "error": error, "detail": cli.scrub_credentials(str(exc))}

    async def read(self, session: str) -> list[Turn] | None:
        """Every turn with its citations, each question less this room's preamble; None once it is gone.

        The library answers "not this caller's" and "no such conversation"
        alike, and both are None here: neither is one this room can reopen.
        """
        async with self._api() as api:
            try:
                conversation = await api.get_caller_conversation(session_id=session)
            except NotFoundException:
                return None
        return [
            Turn(
                question=self._unasked(turn.question),
                answer=turn.answer,
                at=turn.at,
                citations=[citation.to_dict() for citation in turn.citations or []],
            )
            for turn in conversation.turns
        ]

    async def forget(self, session: str) -> None:
        """Delete the conversation at the library: transcript, files and claim. One already gone is forgotten."""
        async with self._api() as api:
            with contextlib.suppress(NotFoundException):
                await api.forget_caller_conversation(session_id=session)

    async def mark(self, session: str, turn: int, *, helpful: bool, note: str | None = None) -> bool:
        """Mark answer `turn` (zero-based) helpful or not, for Milton's review; False if the conversation is gone.

        The mark names the answer and nothing else. The consumer proves the
        conversation is the person's before calling, and never tells the
        library who they are. A second mark replaces the first.
        """
        request = CallerAnswerFeedbackRequest(session_id=session, turn_index=turn, helpful=helpful, note=note)
        async with self._api() as api:
            try:
                await api.record_answer_feedback(request)
            except NotFoundException:
                return False
        return True

    async def document(self, document_id: int) -> Document | None:
        """A cited document, section by section; None unless it sits in one of this room's collections.

        The library scopes the read to the app's whole caller grant, which is
        wider than any room, so the room's collections are checked against
        the document's memberships here. Out of the room reads as absent,
        exactly as out of the grant does: that a document sits on a shelf
        the room does not draw on is a fact the person was never shown.
        """
        async with self._api() as api:
            try:
                detail = await api.get_caller_document(document_id=document_id, sections=True)
            except NotFoundException:
                return None
        if not {membership.collection_name for membership in detail.memberships} & set(self.collections):
            return None
        title = str((detail.metadata or {}).get("title") or "").strip()
        return Document(
            title=title or f"Document {document_id}",
            sections=[
                {"anchor": section.anchor, "heading": section.heading, "text": section.text}
                for section in detail.sections or []
            ],
        )

    async def _configuration(self) -> Configuration:
        return Configuration(host=self.url.rstrip("/"), access_token=await self.token())

    @contextlib.asynccontextmanager
    async def _api(self) -> AsyncIterator[CallerApi]:
        async with EnhancedApiClient(await self._configuration()) as client:
            yield CallerApi(client)

    def _asked(self, question: str) -> str:
        preamble = self.preamble.strip()
        return f"{preamble}{_PREAMBLE_END}{question}" if preamble else question

    def _unasked(self, question: str) -> str:
        """`question` less the preamble `_asked` added; one asked under an earlier preamble comes back whole."""
        preamble = self.preamble.strip()
        return question.removeprefix(f"{preamble}{_PREAMBLE_END}") if preamble else question
