"""The library's collections read as one person, over its caller door, with api-clients' real `library` client."""

import asyncio
import json
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx
import pytest
import respx
from agent_common.collections import Collection, Collections, Document, Passage, passages_block
from library.exceptions import ApiException

URL = "https://library.test/api/caller"


async def _token() -> str:
    return "test-bearer"


def _collections(**kwargs: Any) -> Collections:
    return Collections(URL, _token, **kwargs)


@pytest.fixture
def library() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=URL, assert_all_called=False) as router:
        yield router


def _summary(name: str, *, profile: dict[str, Any] | None, documents_to: str | None, **display: str) -> dict[str, Any]:
    return {
        **display,
        "id": 1,
        "name": name,
        "pipeline": "text",
        "status": "active",
        "owner_project_id": 1,
        "profile": profile,
        "document_count": 1,
        "type_counts": {},
        "documents_to": documents_to,
    }


def _chunk(n: int, *, payload: dict[str, Any] | None, document_id: int | None = 1042) -> dict[str, Any]:
    return {
        "collection": "adf-pay",
        "document_id": document_id,
        "content_hash": None,
        "source": "adf-pay.pdf",
        "title": f"Pay manual {n}",
        "locator": f"page {n}" if n % 2 else None,
        "snippet": f"snippet {n}",
        "score": 0.5,
        "score_basis": "similarity",
        "rank": n,
        "also_carried_by": [],
        "payload": payload,
    }


def _document(**kwargs: Any) -> dict[str, Any]:
    return {
        "id": 1042,
        "hash": "sha256:0",
        "metadata": {"title": "Pay manual"},
        "tags": None,
        "locations": [],
        "memberships": [{"collection_id": 1, "collection_name": "adf-pay", "index_status": "indexed"}],
        "operation_ids": [],
        "sections": [{"anchor": "page-001--leave", "heading": "Leave", "text": "Recreation leave accrues."}],
        "created_at": "2026-09-29T02:11:00+00:00",
        "updated_at": "2026-09-29T02:11:00+00:00",
        **kwargs,
    }


async def test_the_collections_a_person_may_read_come_back_with_their_summaries_and_currency(
    library: respx.MockRouter,
) -> None:
    route = library.get("/collections").respond(
        200,
        json=[
            _summary(
                "adf-pay",
                profile={"summary": " Pay, allowances and leave. "},
                documents_to="2026-09-29",
                title=" ADF pay ",
                description="Rates and leave.",
            ),
            _summary("bare", profile=None, documents_to=None),
        ],
    )

    assert await _collections().list() == [
        Collection("adf-pay", "Pay, allowances and leave.", date(2026, 9, 29), "ADF pay", "Rates and leave."),
        Collection("bare", "", None),
    ]
    assert route.calls.last.request.headers["authorization"] == "Bearer test-bearer"


async def test_a_search_names_its_collections_and_numbers_the_passages_in_rank_order(
    library: respx.MockRouter,
) -> None:
    route = library.post("/query").respond(
        200,
        json={
            "chunks": [
                _chunk(1, payload={"document": "The full passage."}),
                _chunk(2, payload=None, document_id=None),
                _chunk(3, payload={"other": "x"}),
            ],
            "decision_id": "d1",
            "routed_collections": ["adf-pay"],
            "failures": {},
            "empty": False,
        },
    )

    passages = await _collections().search("How much leave?", ["adf-pay", "adf-conditions"], 8)

    assert json.loads(route.calls.last.request.content) == {
        "query": "How much leave?",
        "collections": ["adf-pay", "adf-conditions"],
        "top_k": 8,
    }
    assert route.calls.last.request.headers["authorization"] == "Bearer test-bearer"
    assert passages == [
        Passage(1, "adf-pay", 1042, "Pay manual 1", "page 1", "The full passage."),
        Passage(2, "adf-pay", None, "Pay manual 2", None, "snippet 2"),
        Passage(3, "adf-pay", 1042, "Pay manual 3", "page 3", "snippet 3"),
    ]


async def test_a_cited_document_opens_section_by_section_and_an_absent_one_reads_as_none(
    library: respx.MockRouter,
) -> None:
    route = library.get("/documents/1042").respond(200, json=_document())

    assert await _collections().document(1042) == Document(
        title="Pay manual",
        sections=[{"anchor": "page-001--leave", "heading": "Leave", "text": "Recreation leave accrues."}],
    )
    assert route.calls.last.request.url.params["sections"] == "true"

    library.get("/documents/1042").respond(200, json=_document(metadata={}))
    untitled = await _collections().document(1042)
    assert untitled is not None
    assert untitled.title == "Document 1042"

    library.get("/documents/1042").respond(404, json={"error": "not_found", "message": "absent"})
    assert await _collections().document(1042) is None


async def test_a_refused_call_is_the_callers_to_handle(library: respx.MockRouter) -> None:
    library.get("/collections").respond(401, json={"error": "unauthorized", "message": "unrecognised bearer"})

    with pytest.raises(ApiException):
        await _collections().list()


async def test_a_library_that_does_not_answer_fails_inside_the_timeout(library: respx.MockRouter) -> None:
    async def silent(_request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, json=[])

    library.get("/collections").mock(side_effect=silent)

    async with asyncio.timeout(3):
        with pytest.raises(TimeoutError):
            await _collections(timeout_seconds=0.2).list()


async def test_the_bearer_is_asked_for_on_every_call_and_kept_out_of_the_repr(library: respx.MockRouter) -> None:
    issued: list[str] = []

    async def token() -> str:
        issued.append(f"bearer-{len(issued)}")
        return issued[-1]

    route = library.get("/collections").respond(200, json=[])
    collections = Collections(URL, token)

    await collections.list()
    await collections.list()

    assert [call.request.headers["authorization"] for call in route.calls] == ["Bearer bearer-0", "Bearer bearer-1"]
    assert "bearer" not in repr(collections)


def test_the_passages_block_heads_each_passage_with_its_number_title_place_and_collection() -> None:
    block = passages_block(
        [
            Passage(1, "adf-pay", 1042, "Pay manual", "page 12", "Recreation leave accrues."),
            Passage(2, "adf-conditions", None, "Conditions of service", None, "Reservists serve."),
        ]
    )

    heading, first, second = block.split("\n\n")
    assert heading.startswith("Passages from the collections this person may read, retrieved for this question.")
    assert first == "[1] Pay manual — page 12 (adf-pay)\nRecreation leave accrues."
    assert second == "[2] Conditions of service (adf-conditions)\nReservists serve."


def test_a_search_that_found_nothing_says_so_in_the_same_heading_shape() -> None:
    block = passages_block([])

    assert block.startswith("Passages from the collections this person may read")
    assert "none were found" in block
