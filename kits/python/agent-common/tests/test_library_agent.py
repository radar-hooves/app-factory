"""Milton through the library's caller door, over recorded bytes, with api-clients' real `library` client.

`fixtures/library-ask.sse` is the ask stream as the library frames it: the
Claude Code events are `@poodle64/librarian`'s `chat-stream.jsonl`, captured
from the real CLI with `--include-partial-messages` (radar-hooves/
design-system), between the library's own `queued` frames before and its
`citations` and `suggestions` frames after, in the shapes the library's
`api/librarian/session.py` and `ask.py` write them. No live ask made them:
Milton runs on mimir. `fixtures/library-conversation-read.json` is the
library's own response body for a conversation read, captured from its route
(radar-hooves/cadmus `backend/tests/fixtures/`).
"""

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from agent_common import cli
from agent_common.agent import Agent
from agent_common.library_agent import Document, LibraryAgent

URL = "https://library.test/api/caller"
FIXTURES = Path(__file__).parent / "fixtures"
RECORDED = (FIXTURES / "library-ask.sse").read_bytes()
PREAMBLE = "You are Milton, the librarian for the receipts room."
DENIAL = "that session is not one you can continue; ask again without it to start a new conversation"


def _frames(sse: bytes) -> list[dict[str, Any]]:
    return [json.loads(block.removeprefix(b"data: ")) for block in sse.split(b"\n\n") if block]


async def _token() -> str:
    return "test-bearer"


def _agent(**kwargs: Any) -> LibraryAgent:
    return LibraryAgent(URL, ["receipts"], _token, **{"preamble": PREAMBLE, **kwargs})


async def _ask(agent: Agent, question: str, **kwargs: Any) -> list[dict[str, Any]]:
    return [event async for event in agent.ask(question, **kwargs)]


class _Body(httpx.AsyncByteStream):
    """A response body sent frame by frame: each waits for its gate, and closing it is recorded."""

    def __init__(self, frames: list[bytes], gates: dict[int, asyncio.Event] | None = None) -> None:
        self.frames = frames
        self.gates = gates or {}
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for index, frame in enumerate(self.frames):
            if index in self.gates:
                await self.gates[index].wait()
            yield frame

    async def aclose(self) -> None:
        self.closed = True


def _split(sse: bytes) -> list[bytes]:
    return [block + b"\n\n" for block in sse.split(b"\n\n") if block]


@pytest.fixture
def library() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=URL) as router:
        yield router


async def test_every_recorded_frame_passes_through_verbatim_in_order(library: respx.MockRouter) -> None:
    route = library.post("/ask").respond(200, content=RECORDED, headers={"content-type": "text/event-stream"})
    agent: Agent = _agent()

    events = await _ask(agent, "What was the total?")

    assert events == _frames(RECORDED)
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer test-bearer"
    assert json.loads(request.content) == {
        "question": f"{PREAMBLE}\n\nWhat was the total?",
        "collections": ["receipts"],
        "subtree": "",
    }


async def test_each_frame_is_yielded_before_the_next_arrives(library: respx.MockRouter) -> None:
    frames = _split(RECORDED)
    released = asyncio.Event()
    library.post("/ask").respond(200, stream=_Body(frames, {1: released}))

    turn = _agent().ask("What was the total?")
    async with asyncio.timeout(5):
        first = await anext(turn)
    released.set()
    rest = [event async for event in turn]

    assert [first, *rest] == _frames(RECORDED)


async def test_a_resume_the_library_refuses_comes_back_as_its_own_frame(library: respx.MockRouter) -> None:
    refusal = f"data: {json.dumps({'type': 'library_error', 'error': DENIAL})}\n\n".encode()
    route = library.post("/ask").respond(200, content=refusal)

    events = await _ask(_agent(), "And then?", resume="e533e3de-0528-4ab7-8133-53a7cb3e6ab8")

    assert events == [{"type": cli.ERROR_EVENT, "error": DENIAL}]
    assert json.loads(route.calls.last.request.content)["resume"] == "e533e3de-0528-4ab7-8133-53a7cb3e6ab8"


async def test_depth_reaches_the_library_and_omits_by_default(library: respx.MockRouter) -> None:
    route = library.post("/ask").respond(200, content=RECORDED)

    await _ask(_agent(), "What was the total?", depth="thorough")
    assert json.loads(route.calls.last.request.content)["depth"] == "thorough"

    await _ask(_agent(), "What was the total?")
    assert "depth" not in json.loads(route.calls.last.request.content)


async def test_attachments_go_multipart_by_base_name(library: respx.MockRouter) -> None:
    route = library.post("/ask").respond(200, content=RECORDED)

    await _ask(_agent(), "What is in this?", files={"../../report.pdf": b"%PDF"})

    request = route.calls.last.request
    assert request.headers["content-type"].startswith("multipart/form-data")
    assert b'filename="report.pdf"' in request.content
    assert b'name="collections[]"' in request.content
    assert f"{PREAMBLE}\n\nWhat is in this?".encode() in request.content


async def test_a_refused_request_ends_the_turn_with_one_error_frame(library: respx.MockRouter) -> None:
    library.post("/ask").respond(401, json={"error": "unauthorized", "message": "unrecognised bearer"})

    [event] = await _ask(_agent(), "What was the total?")

    assert event["type"] == cli.ERROR_EVENT
    assert event["error"] == "library answered HTTP 401"


async def test_a_connection_lost_mid_answer_ends_the_turn_with_one_error_frame(library: respx.MockRouter) -> None:
    class Lost(_Body):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield self.frames[0]
            raise httpx.ReadError("connection reset")

    library.post("/ask").respond(200, stream=Lost(_split(RECORDED)))

    events = await _ask(_agent(), "What was the total?")

    assert events[0] == _frames(RECORDED)[0]
    assert events[1]["type"] == cli.ERROR_EVENT
    assert events[1]["error"] == "library connection lost"
    assert len(events) == 2


async def test_silence_past_the_idle_timeout_ends_the_turn_and_closes_the_stream(library: respx.MockRouter) -> None:
    body = _Body(_split(RECORDED), {1: asyncio.Event()})
    library.post("/ask").respond(200, stream=body)

    events = await _ask(_agent(timeout_seconds=0.2), "What was the total?")

    assert events == [_frames(RECORDED)[0], {"type": cli.ERROR_EVENT, "error": "agent exceeded its wall clock"}]
    assert body.closed


async def test_closing_the_turn_closes_the_stream(library: respx.MockRouter) -> None:
    body = _Body(_split(RECORDED), {1: asyncio.Event()})
    library.post("/ask").respond(200, stream=body)

    turn = _agent().ask("What was the total?")
    async with asyncio.timeout(5):
        await anext(turn)
    await turn.aclose()

    assert body.closed


async def test_a_conversation_reads_back_as_turns_less_the_preamble(library: respx.MockRouter) -> None:
    body = json.loads((FIXTURES / "library-conversation-read.json").read_text())
    asked = [turn["question"] for turn in body["turns"]]
    body["turns"][0]["question"] = f"{PREAMBLE}\n\n{asked[0]}"
    body["turns"][1]["question"] = f"An earlier preamble.\n\n{asked[1]}"
    route = library.get(f"/conversations/{body['session_id']}").respond(200, json=body)

    turns = await _agent().read(body["session_id"])

    assert turns is not None
    assert [turn.question for turn in turns] == [asked[0], f"An earlier preamble.\n\n{asked[1]}"]
    assert turns[0].answer == body["turns"][0]["answer"]
    assert turns[0].at == datetime(2026, 9, 10, 1, 0, tzinfo=UTC)
    assert turns[0].citations == body["turns"][0]["citations"]
    assert turns[1].citations == []
    assert route.calls.last.request.headers["authorization"] == "Bearer test-bearer"


async def test_a_conversation_the_library_does_not_hold_reads_as_none(library: respx.MockRouter) -> None:
    library.get("/conversations/gone").respond(404, json={"error": "not_found", "message": "no such conversation"})

    assert await _agent().read("gone") is None


async def test_forget_deletes_at_the_library_and_forgetting_twice_is_done(library: respx.MockRouter) -> None:
    route = library.delete("/conversations/s1").mock(
        side_effect=[httpx.Response(204), httpx.Response(404, json={"error": "not_found", "message": "absent"})]
    )

    await _agent().forget("s1")
    await _agent().forget("s1")

    assert route.call_count == 2


async def test_a_mark_names_the_answer_and_nothing_else(library: respx.MockRouter) -> None:
    route = library.post("/ask/feedback").respond(
        200, json={"session_id": "s1", "turn_index": 0, "helpful": False, "note": "out of date"}
    )

    assert await _agent().mark("s1", 0, helpful=False, note="out of date")
    assert json.loads(route.calls.last.request.content) == {
        "session_id": "s1",
        "turn_index": 0,
        "helpful": False,
        "note": "out of date",
    }

    library.post("/ask/feedback").respond(404, json={"error": "not_found", "message": "absent"})
    assert not await _agent().mark("gone", 0, helpful=True)


def _document(collection: str) -> dict[str, Any]:
    return {
        "id": 1042,
        "hash": "sha256:0",
        "metadata": {"title": "Receipts register"},
        "tags": None,
        "locations": [],
        "memberships": [{"collection_id": 1, "collection_name": collection, "index_status": "indexed"}],
        "operation_ids": [],
        "sections": [{"anchor": "page-001--groceries", "heading": "Groceries", "text": "TOTAL 4.95"}],
        "created_at": "2026-09-29T02:11:00+00:00",
        "updated_at": "2026-09-29T02:11:00+00:00",
    }


async def test_a_cited_document_opens_only_inside_the_room(library: respx.MockRouter) -> None:
    route = library.get("/documents/1042").respond(200, json=_document("receipts"))

    assert await _agent().document(1042) == Document(
        title="Receipts register",
        sections=[{"anchor": "page-001--groceries", "heading": "Groceries", "text": "TOTAL 4.95"}],
    )
    assert route.calls.last.request.url.params["sections"] == "true"

    library.get("/documents/1042").respond(200, json=_document("another-room"))
    assert await _agent().document(1042) is None

    library.get("/documents/1042").respond(404, json={"error": "not_found", "message": "absent"})
    assert await _agent().document(1042) is None


async def test_the_bearer_is_asked_for_on_every_call(library: respx.MockRouter) -> None:
    issued: list[str] = []

    async def token() -> str:
        issued.append(f"bearer-{len(issued)}")
        return issued[-1]

    route = library.get("/conversations/s1").respond(200, json={"session_id": "s1", "turns": []})
    agent = LibraryAgent(URL, ["receipts"], token)

    await agent.read("s1")
    await agent.read("s1")

    assert [call.request.headers["authorization"] for call in route.calls] == ["Bearer bearer-0", "Bearer bearer-1"]
    assert "bearer" not in repr(agent)
