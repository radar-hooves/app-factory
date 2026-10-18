"""The library's collections, read as the person asking: what they may read, passages from it, and a cited document.

Everything goes through api-clients' typed `library` client of the library's
caller door (`CallerApi`). The library answers as the bearer's person: which
collections it lists, which passages a query returns and which documents open
are that person's cut, so nothing here narrows or widens it. `search` is the
one exception to "the library scopes it": `/query` drops a person's cut when
it is given no names, so the caller names the collections explicitly, always.

The kit holds no credential. The consumer hands in `token`, awaited before
every call; a token minted for the person (aud = the library) reaches the
library as them.

Need: radar-hooves/godswood, 17/10/2026 (master-project#380).
"""

import asyncio
import builtins
import contextlib
import datetime
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass, field

from library import CallerApi, Configuration, QueryRequest
from library.exceptions import NotFoundException
from library.wrappers import EnhancedApiClient

from agent_common.agent import PASSAGES_START

#: Heads the passages block appended to a question.
_PASSAGES = (
    f"{PASSAGES_START}, retrieved for this question. Answer from them, cite each claim by its number as [1], "
    "and say plainly when they do not hold the answer:"
)

#: The same heading when the search found nothing.
_NO_PASSAGES = (
    f"{PASSAGES_START}, retrieved for this question: none were found. "
    "Say plainly that the collections do not answer it, and do not answer from memory."
)


@dataclass(frozen=True, slots=True)
class Collection:
    """A collection the person may read: its id, how it is shown to a reader, and how current it is.

    `title` and `description` are the library's reader-facing display title
    and one-line description, empty where it publishes none. `summary` is its
    retrieval-pipeline summary: filing history for the model's routing, never
    shown to a reader. `documents_to` is when the library last confirmed a
    document current (a recheck's `unchanged`, or a fetch), never a
    publication date.
    """

    name: str
    summary: str
    documents_to: datetime.date | None
    title: str = ""
    description: str = ""


@dataclass(frozen=True, slots=True)
class Passage:
    """One retrieved passage, numbered from 1 in the library's rank order, so `[n]` in an answer names it."""

    n: int
    collection: str
    document_id: int | None
    title: str
    locator: str | None
    text: str


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
class Collections:
    """The library's collections as one person reads them.

    `url` is the caller mount (`https://library.example/api/caller`).
    `timeout_seconds` bounds each call: retrieval sits on the answer path, so
    a library that does not answer fails the turn rather than holding it.
    `list` hides the builtin in this class, so its annotations say `builtins.list`.
    """

    url: str
    token: Callable[[], Awaitable[str]] = field(repr=False)
    timeout_seconds: float = 30.0

    async def list(self) -> builtins.list[Collection]:
        """Every collection the library lists for this person, in its order."""
        async with self._api() as api:
            summaries = await api.list_caller_collections()
        return [
            Collection(
                name=summary.name,
                summary=str((summary.profile or {}).get("summary") or "").strip(),
                documents_to=summary.documents_to,
                title=str(getattr(summary, "title", None) or "").strip(),
                description=str(getattr(summary, "description", None) or "").strip(),
            )
            for summary in summaries
        ]

    async def search(self, query: str, names: Sequence[str], top_k: int) -> builtins.list[Passage]:
        """The `top_k` passages of `names` that best answer `query`, numbered from 1 in the library's rank order.

        `names` are always passed: the library's `/query` reads none given as
        "no restriction" and drops the person's cut. A passage's text is the
        chunk's full text (`payload["document"]`), or its snippet where the
        library sent no payload.
        """
        request = QueryRequest(query=query, collections=builtins.list(names), top_k=top_k)
        async with self._api() as api:
            response = await api.query_as_caller(query_request=request)
        return [
            Passage(
                n=n,
                collection=chunk.collection,
                document_id=chunk.document_id,
                title=chunk.title,
                locator=chunk.locator,
                text=str((chunk.payload or {}).get("document") or chunk.snippet or ""),
            )
            for n, chunk in enumerate(response.chunks, start=1)
        ]

    async def document(self, document_id: int) -> Document | None:
        """A cited document, section by section; None where the library has none this person may read.

        The library answers "not there" and "not yours" alike, so a document
        outside the person's collections reads as absent.
        """
        async with self._api() as api:
            try:
                detail = await api.get_caller_document(document_id=document_id, sections=True)
            except NotFoundException:
                return None
        title = str((detail.metadata or {}).get("title") or "").strip()
        return Document(
            title=title or f"Document {document_id}",
            sections=[
                {"anchor": section.anchor, "heading": section.heading, "text": section.text}
                for section in detail.sections or []
            ],
        )

    @contextlib.asynccontextmanager
    async def _api(self) -> AsyncIterator[CallerApi]:
        """A caller API on a fresh token, every call under the timeout."""
        configuration = Configuration(host=self.url.rstrip("/"), access_token=await self.token())
        async with asyncio.timeout(self.timeout_seconds):
            async with EnhancedApiClient(configuration, max_retries=1, request_timeout=self.timeout_seconds) as client:
                yield CallerApi(client)


def passages_block(passages: list[Passage]) -> str:
    """The text appended to a question: the heading, then each passage as `[n] title — locator (collection)` and its text."""
    if not passages:
        return _NO_PASSAGES
    entries = [
        f"[{p.n}] {p.title}{f' — {p.locator}' if p.locator else ''} ({p.collection})\n{p.text}" for p in passages
    ]
    return "\n\n".join([_PASSAGES, *entries])
