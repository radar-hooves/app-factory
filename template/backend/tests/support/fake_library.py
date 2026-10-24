#!/usr/bin/env python3
"""Stand-in for the library's caller door (`/api/caller`), over real HTTP.

A persona that chats with collections reads the library through
`agent_common.collections.Collections`, which goes through api-clients'
`library` client; this serves that client the routes and bodies the library
does, so the suite and the E2E drive the real kit and the real client rather
than a mock standing in for either.

- `GET /collections`: the collections the bearer's person may read
  (`grants`; `COLLECTION` and `SECOND` unless a test says otherwise), each
  with the summary and currency a reader sees. `RESTRICTED` is in the
  catalogue and granted to no one by default.
- `POST /query`: one passage per named collection, up to `top_k`, in the
  order named, each carrying its full text at `payload["document"]` and the
  query it answered in that text. A name the person may not read is refused
  403, as the library refuses an ungranted collection. A query naming none
  reads every collection in the catalogue, as the library drops a person's
  cut when given no names: a caller that sends none is caught reading
  `RESTRICTED`. Every query is kept in `queries`.
- `GET /documents/{id}`: a document in `COLLECTION` or in `RESTRICTED`,
  404 to a person who may not read the collection it sits in.
- `silent`: collections a query returns no passage from, as a search that
  misses a document the person has just read.
- `fail_with`: every call answers this status, for a library that is down or
  refusing.

Every call needs a bearer, as the caller door does; each is kept in
`bearers`, and `verifier` (the suite's fake Authentik checks audience,
issuer and signature) names the person it was minted for. Run by hand for
the E2E: `python fake_library.py --port 18766`.
"""

import argparse
import json
import re
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

COLLECTION = "manual"
SECOND = "conditions"
RESTRICTED = "restricted"
DOCUMENT_ID = 1042
RESTRICTED_ID = 2048
#: `COLLECTION`'s currency mark, the date `test_agent_api.py.jinja` expects its listing to show.
DOCUMENTS_TO = "2026-09-29"
SUMMARY = "Pay, allowances and leave."

_CATALOGUE = {
    COLLECTION: (1, SUMMARY, DOCUMENTS_TO, DOCUMENT_ID),
    SECOND: (2, "Conditions of service.", "2026-09-20", None),
    RESTRICTED: (3, "Held back.", None, RESTRICTED_ID),
}

#: What each collection is about, and the title a picker row has room for, as the library groups them.
#: `RESTRICTED` shares `COLLECTION`'s subject, so a subject is only ever what this person may read of it.
PAY = "pay"
SERVICE = "service"
_SUBJECTS = {
    COLLECTION: ("Manual", {"name": PAY, "title": "Pay and leave"}),
    SECOND: ("", {"name": SERVICE, "title": "Conditions of service"}),
    RESTRICTED: ("Held", {"name": PAY, "title": "Pay and leave"}),
}


class FakeLibrary:
    def __init__(self, verifier: Callable[[str], str] | None = None) -> None:
        self.verifier = verifier
        #: Who may read what, by person; a person absent from it reads `COLLECTION` and `SECOND`.
        self.grants: dict[str, list[str]] = {}
        self.fail_with: int | None = None
        #: Collections whose passages a query misses: it returns nothing from them.
        self.silent: set[str] = set()
        #: Every query as the door received it, with the person who made it.
        self.queries: list[dict[str, Any]] = []
        #: Every listing as the door received it: the person who asked, in order.
        self.listings: list[str] = []
        #: Every call's bearer, in order.
        self.bearers: list[str] = []
        self.lock = threading.Lock()
        self.port = 0

    def readable(self, person: str) -> list[str]:
        return self.grants.get(person, [COLLECTION, SECOND])

    def serve(self, port: int = 0) -> ThreadingHTTPServer:
        library = self

        class Handler(_Handler):
            fake = library

        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        server.daemon_threads = True
        self.port = server.server_port
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server


def _document(document_id: int, collection: str) -> dict[str, Any]:
    return {
        "id": document_id,
        "hash": f"sha256:{document_id}",
        "metadata": {"title": "The Manual, Part 5: Leave"},
        "tags": None,
        "locations": [],
        "memberships": [{"collection_id": 1, "collection_name": collection, "index_status": "indexed"}],
        "operation_ids": [],
        "sections": [
            {"anchor": "5-1", "heading": "5.1 Recreation leave", "text": "A member accrues four weeks a year."},
            {"anchor": "5-2", "heading": "5.2 Long service leave", "text": "Accrues after ten years."},
        ],
        "created_at": "2026-09-29T02:11:00+00:00",
        "updated_at": "2026-09-29T02:11:00+00:00",
    }


def _summary(name: str) -> dict[str, Any]:
    collection_id, summary, documents_to, _ = _CATALOGUE[name]
    short_title, subject = _SUBJECTS[name]
    return {
        "id": collection_id,
        "name": name,
        "short_title": short_title,
        "subject": subject,
        "pipeline": "text",
        "status": "active",
        "owner_project_id": 1,
        "profile": {"summary": summary},
        "document_count": 1,
        "type_counts": {},
        "documents_to": documents_to,
    }


def _chunk(rank: int, collection: str, query: str) -> dict[str, Any]:
    _, _, _, document_id = _CATALOGUE[collection]
    text = f"In {collection}, on {query!r}: a member accrues four weeks of recreation leave each year of service."
    return {
        "collection": collection,
        "document_id": document_id,
        "content_hash": None,
        "source": f"{collection}.pdf",
        "title": "The Manual, Part 5: Leave",
        "locator": "5.1 Recreation leave",
        "snippet": text[:60],
        "score": 0.9 - rank / 100,
        "score_basis": "similarity",
        "rank": rank,
        "also_carried_by": [],
        "payload": {"document": text},
    }


class _Handler(BaseHTTPRequestHandler):
    fake: FakeLibrary
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send(self, status: int, body: object | None = None) -> None:
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _person(self) -> str | None:
        """Who the bearer was minted for, or None once the call has been answered with a refusal."""
        header = self.headers.get("Authorization") or ""
        if self.fake.fail_with is not None:
            self._send(self.fake.fail_with, {"error": "refused", "message": "this library is refusing"})
            return None
        if not header.startswith("Bearer ") or len(header) <= 7:
            self._send(401, {"error": "unauthorized", "message": "no bearer"})
            return None
        bearer = header[7:]
        with self.fake.lock:
            self.fake.bearers.append(bearer)
        if self.fake.verifier is None:
            return "anonymous"
        try:
            return self.fake.verifier(bearer)
        except Exception:
            self._send(401, {"error": "unauthorized", "message": "unrecognised bearer"})
            return None

    def do_GET(self) -> None:
        if (person := self._person()) is None:
            return
        path = self.path.split("?")[0]
        readable = self.fake.readable(person)
        if path == "/collections":
            with self.fake.lock:
                self.fake.listings.append(person)
            self._send(200, [_summary(name) for name in readable])
        elif match := re.fullmatch(r"/documents/(\d+)", path):
            held = next((name for name, row in _CATALOGUE.items() if row[3] == int(match[1])), None)
            if held is None or held not in readable:
                self._send(404, {"error": "not_found", "message": "no such document"})
            else:
                self._send(200, _document(int(match[1]), held))
        else:
            self._send(404, {"error": "not_found", "message": path})

    def do_POST(self) -> None:
        if (person := self._person()) is None:
            return
        body: dict[str, Any] = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.path != "/query":
            self._send(404, {"error": "not_found", "message": self.path})
            return
        with self.fake.lock:
            self.fake.queries.append({**body, "person": person})
        names = body.get("collections") or list(_CATALOGUE)
        if refused := [name for name in names if name not in self.fake.readable(person)]:
            self._send(403, {"error": "forbidden", "message": f"no read grant on {refused[0]}"})
            return
        heard = [name for name in names if name not in self.fake.silent]
        chunks = [_chunk(rank, name, body["query"]) for rank, name in enumerate(heard[: body.get("top_k", 5)], 1)]
        self._send(
            200,
            {"chunks": chunks, "decision_id": "d1", "routed_collections": names, "failures": {}, "empty": not chunks},
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=18766)
    options = parser.parse_args()
    FakeLibrary().serve(options.port)
    threading.Event().wait()
