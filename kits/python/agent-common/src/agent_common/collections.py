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
import logging
import math
import re
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Any

from library import CallerApi, Configuration, QueryRequest
from library.exceptions import NotFoundException
from library.wrappers import EnhancedApiClient

from agent_common.agent import PASSAGES_START

logger = logging.getLogger(__name__)

#: Heads the passages block appended to a question. Each number is one document, however many passages come from it.
_PASSAGES = (
    f"{PASSAGES_START}, retrieved for this question. Each number is one document: answer from them, "
    "cite each claim by its document's number as [1], and say plainly when they do not hold the answer:"
)

#: Added to the heading of a follow-up, which is searched on its own words: what the earlier turns drew on is still in the conversation.
_FOLLOW_UP = (
    " This message follows earlier ones and was searched on its own words; the passages of the earlier turns are "
    "still in this conversation. A message that continues them is answered from them as well, and one that asks "
    "nothing of the collections is answered as what it is, ignoring passages that do not bear on it."
)

#: Most documents a turn opens beyond the passages the search returned, taken in rank order.
OPENED_DOCUMENTS = 3

#: A document this short is given to the model whole.
SHORT_DOCUMENT_CHARACTERS = 6000

#: A section this short is given whole; a longer one is cut to the rows and paragraphs that name what was asked.
SECTION_CHARACTERS = 3000

#: Most characters a turn adds to the passages from the documents' own text.
EXCERPT_CHARACTERS = 20000

#: How long opening documents may take; the passages are enough to answer without them.
OPEN_TIMEOUT_SECONDS = 5.0

_WORD = re.compile(r"[a-z0-9]{2,}")
_STOP = frozenset(
    re.findall(
        r"[a-z]+",
        "the and for are but not you can how what who when where which with from into that this have has had was were will would could should about does "
        "did your our their its his her them they than then there here very just also any all some more most other such only own same too out off over "
        "under again please tell give show in of to is an at on or as by it be do if no so up we my me he",
    )
)

#: The same heading when the search found nothing.
_NO_PASSAGES = (
    f"{PASSAGES_START}, retrieved for this question: none were found. "
    "Say plainly that the collections do not answer it, and do not answer from memory."
)


def _display(summary: Any, key: str) -> str:
    """A display field of a listing row: declared on the client's model, else the undeclared key it keeps."""
    value = getattr(summary, key, None) or getattr(summary, "additional_properties", {}).get(key)
    return str(value or "").strip()


@dataclass(frozen=True, slots=True)
class Subject:
    """What a collection is about, as the library groups its collections: one reader can pick a subject whole."""

    name: str
    title: str


def _subject(summary: Any) -> Subject | None:
    """A listing row's subject (`{name, title}`): declared on the client's model, else the undeclared key it keeps."""
    value = getattr(summary, "subject", None) or getattr(summary, "additional_properties", {}).get("subject")
    if isinstance(value, dict):
        named, titled = value.get("name"), value.get("title")
    else:
        named, titled = getattr(value, "name", None), getattr(value, "title", None)
    name = str(named or "").strip()
    return Subject(name, str(titled or "").strip() or name) if name else None


@dataclass(frozen=True, slots=True)
class Collection:
    """A collection the person may read: its id, how it is shown to a reader, and how current it is.

    `title` and `description` are the library's reader-facing display title
    and one-line description, empty where it publishes none; `short_title` is
    the title a picker row has room for ("DASR"), and `subject` what it is
    about, by which the library groups collections a reader may pick whole
    ("Airworthiness"). `summary` is its
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
    short_title: str = ""
    subject: Subject | None = None


@dataclass(frozen=True, slots=True)
class Passage:
    """One retrieved chunk of a document: where in it, and its text."""

    locator: str | None
    text: str


@dataclass(frozen=True, slots=True)
class Source:
    """One document the search drew on, numbered from 1 in the library's rank order, so `[n]` in an answer names it.

    `passages` are the chunks the search returned from it, in rank order.
    `excerpts` are further text of the same document, opened for the question
    (a short document whole, a long one's rows and paragraphs that name what
    was asked), which the model reads and the reader's citation does not show.
    A chunk with no document id is a source of its own.
    """

    n: int
    collection: str
    document_id: int | None
    title: str
    passages: tuple[Passage, ...]
    excerpts: tuple[Passage, ...] = ()


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
                title=_display(summary, "title"),
                description=_display(summary, "description"),
                short_title=_display(summary, "short_title"),
                subject=_subject(summary),
            )
            for summary in summaries
        ]

    async def search(self, query: str, names: Sequence[str], top_k: int) -> builtins.list[Source]:
        """The documents of `names` that best answer `query`, numbered from 1 in the order the library first ranks them.

        The `top_k` chunks it returns are grouped by document: a document with
        several chunks is one source with all of them behind its one number.
        `names` are always passed: the library's `/query` reads none given as
        "no restriction" and drops the person's cut. A chunk's text is its full
        text (`payload["document"]`), or its snippet where the library sent no
        payload.
        """
        request = QueryRequest(query=query, collections=builtins.list(names), top_k=top_k)
        async with self._api() as api:
            response = await api.query_as_caller(query_request=request)
        grouped: dict[tuple[str, int | None] | int, tuple[str, int | None, str, builtins.list[Passage]]] = {}
        for index, chunk in enumerate(response.chunks):
            key = (chunk.collection, chunk.document_id) if chunk.document_id is not None else index
            passage = Passage(chunk.locator, str((chunk.payload or {}).get("document") or chunk.snippet or ""))
            if key in grouped:
                grouped[key][3].append(passage)
            else:
                grouped[key] = (chunk.collection, chunk.document_id, chunk.title, [passage])
        return [
            Source(n, collection, document_id, title, tuple(passages))
            for n, (collection, document_id, title, passages) in enumerate(grouped.values(), start=1)
        ]

    async def opened(
        self,
        sources: builtins.list[Source],
        question: str,
        *,
        earlier: Mapping[int, asyncio.Task[Document | None]] | None = None,
    ) -> builtins.list[Source]:
        """`sources` with the text of their documents the question needs, and the `earlier` turn's documents it names.

        The search returns chunks, and a chunk of a long table or a short
        annex need not hold the row asked for. The first `OPENED_DOCUMENTS`
        sources are opened and given the model whole when short, else the
        sections, rows and paragraphs that carry the question's words, weighted
        by how few sections of that document carry them, within
        `EXCERPT_CHARACTERS` for the turn. `earlier` are `document` tasks the
        caller started for what an earlier turn cited, which a follow-up leans
        on though this search missed it: each is added as a further source
        only where it carries those words. Opening is an enrichment: a
        document that cannot be read within `OPEN_TIMEOUT_SECONDS` is logged
        and the passages stand alone.
        """
        terms = _terms(question)
        held = {source.document_id for source in sources}
        tasks = {
            document_id: asyncio.ensure_future(self.document(document_id))
            for document_id in dict.fromkeys(s.document_id for s in sources[:OPENED_DOCUMENTS])
            if document_id is not None
        }
        carried = {i: task for i, task in (earlier or {}).items() if i not in held}
        for task in (earlier or {}).values():
            if task not in carried.values():
                task.cancel()
        tasks |= carried
        try:
            done, _ = await asyncio.wait(tasks.values(), timeout=OPEN_TIMEOUT_SECONDS) if tasks else (set(), set())
        except BaseException:
            for task in tasks.values():
                task.cancel()
            raise
        found: dict[int, Document] = {}
        for document_id, task in tasks.items():
            if task not in done:
                task.cancel()
                logger.warning("Opening document %s timed out; answering from the passages", document_id)
            elif task.cancelled() or (error := task.exception()):
                logger.warning(
                    "Could not open document %s; answering from the passages",
                    document_id,
                    exc_info=None if task.cancelled() else error,
                )
            elif (document := task.result()) is not None:
                found[document_id] = document
        budget = EXCERPT_CHARACTERS
        result: builtins.list[Source] = []
        for source in sources:
            document = found.get(source.document_id) if source.document_id is not None else None
            excerpts = _excerpts(document, terms, source.passages, whole=True, budget=budget) if document else ()
            budget -= sum(len(p.text) for p in excerpts)
            result.append(replace(source, excerpts=excerpts))
        for document_id in carried:
            if (document := found.get(document_id)) is None:
                continue
            excerpts = _excerpts(document, terms, (), whole=False, budget=budget)
            if excerpts:
                budget -= sum(len(p.text) for p in excerpts)
                result.append(Source(len(result) + 1, "", document_id, document.title, (), excerpts))
        return result

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


def _terms(question: str) -> frozenset[str]:
    """The words of a question that can name something: no stop words, a trailing plural dropped."""
    return frozenset(
        w.removesuffix("s") if len(w) > 4 else w for w in _WORD.findall(question.lower()) if w not in _STOP
    )


def _hits(text: str, terms: frozenset[str]) -> frozenset[str]:
    """Which of `terms` start a word of `text`."""
    words = set(_WORD.findall(text.lower()))
    return frozenset(t for t in terms if any(w.startswith(t) for w in words))


def _squash(text: str) -> str:
    return " ".join(text.split())


def _excerpts(
    document: Document, terms: frozenset[str], shown: tuple[Passage, ...], *, whole: bool, budget: int
) -> tuple[Passage, ...]:
    """What of `document` the question needs beyond `shown`, in the document's order and within `budget` characters.

    Text already in `shown` is not repeated. A section longer than
    `SECTION_CHARACTERS` is cut to its blocks that name the question's words,
    a long table to its header and the rows that do.
    """
    seen = _squash(" ".join(p.text for p in shown))
    sections = document.sections
    if whole and sum(len(s["text"]) for s in sections) <= SHORT_DOCUMENT_CHARACTERS:
        scored = [(1.0, i) for i in range(len(sections))]
    else:
        hit = [_hits(f"{s['heading']} {s['text']}", terms) for s in sections]
        weight = {t: math.log(1 + len(sections) / n) for t in terms if (n := sum(t in h for h in hit))}
        scored = sorted(
            ((sum(weight[t] for t in h), i) for i, h in enumerate(hit) if h), key=lambda pair: (-pair[0], pair[1])
        )
    taken: dict[int, Passage] = {}
    for _, i in scored:
        section = sections[i]
        if whole and _covered(section["text"], shown):
            continue
        text = section["text"] if len(section["text"]) <= SECTION_CHARACTERS else _blocks(section["text"], terms)
        if not text.strip() or _squash(text) in seen or len(text) > budget:
            continue
        budget -= len(text)
        taken[i] = Passage(section["heading"] or None, text)
    return tuple(taken[i] for i in sorted(taken))


def _covered(section: str, shown: tuple[Passage, ...]) -> bool:
    """Whether passages already shown make up most of `section`, so repeating it adds little."""
    squashed = _squash(section)
    inside = sum(len(_squash(p.text)) for p in shown if _squash(p.text) in squashed)
    return inside * 2 >= len(squashed)


def _blocks(text: str, terms: frozenset[str]) -> str:
    """The blocks of a long section that name the question's words; a long table's header and matching rows only."""
    kept: builtins.list[str] = []
    previous = ""
    for block in re.split(r"\n\s*\n", text):
        lines = block.splitlines()
        start = next((i for i, line in enumerate(lines) if line.lstrip().startswith("|")), None)
        if len(block) > SECTION_CHARACTERS // 2 and start is not None:
            rows = [line for line in lines[start + 2 :] if _hits(line, terms)]
            if rows:
                if previous and previous not in kept:
                    kept.append(previous)
                kept.append("\n".join([*lines[: start + 2], *rows]))
        elif _hits(block, terms):
            kept.append(block)
        previous = block if len(block) <= 400 else ""
    return "\n\n".join(kept)


def passages_block(sources: builtins.list[Source], *, follow_up: bool = False) -> str:
    """The text appended to a question: the heading, then each document as `[n] title (collection)` and its passages.

    A passage is its place in the document, then its text. `follow_up` adds to
    the heading what a message searched on its own words needs to be told.
    """
    if not sources:
        return _NO_PASSAGES
    entries = []
    for s in sources:
        head = f"[{s.n}] {s.title}{f' ({s.collection})' if s.collection else ''}"
        parts = [f"{f'— {p.locator}{chr(10)}' if p.locator else ''}{p.text}" for p in (*s.passages, *s.excerpts)]
        entries.append("\n\n".join([head, *parts]))
    return "\n\n".join([_PASSAGES + (_FOLLOW_UP if follow_up else ""), *entries])
