#!/usr/bin/env python3
"""Stand-in for the library's caller door (`/api/caller`), over real HTTP.

A library room's agent is `agent_common`'s `LibraryAgent`, which reaches the
library through api-clients' `library` client; this serves that client the
routes and bodies the library does, so the suite and the E2E drive the real
agent and the real client rather than a mock standing in for either.

- `POST /ask`, JSON or multipart: `queued` frames first when the question
  holds `__queued__`, then Claude Code's own `system`/`init`, the answer as
  `stream_event` deltas a word at a time (`pace` seconds apart), the whole
  `assistant` event, `result`, and then the library's `citations` frame, as
  the library sends them. The question
  arrives with the room's preamble and is kept as it arrived. `__hang__`
  names the session and then answers nothing until the asker hangs up, a
  question a stop ends; only an answered question is kept, as the library's
  own transcript read lists only answered turns.
- `GET` and `DELETE /conversations/{id}`, `POST /ask/feedback` (recorded in
  `marks`), `GET /documents/{id}` (a document in `COLLECTION`, and one in
  `ELSEWHERE`, which no room here draws on), `GET /collections` (`COLLECTION`
  carries `DOCUMENTS_TO`, `ELSEWHERE` an earlier date, as the caller's whole
  grant -- wider than any one room -- would).

Every call needs a bearer, as the caller door does. Run by hand for the
E2E: `python fake_library.py --port 18766 --pace 0.05`.
"""

import argparse
import json
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

COLLECTION = "manual"
ELSEWHERE = "another-shelf"
DOCUMENT_ID = 1042
OUTSIDE_ID = 2048
HANG_TRIGGER = "__hang__"
QUEUED_TRIGGER = "__queued__"
#: `COLLECTION`'s currency mark, the date `test_agent_api.py.jinja` expects the room's home to show.
DOCUMENTS_TO = "2026-09-29"


class FakeLibrary:
    def __init__(self, pace: float = 0.0) -> None:
        self.pace = pace
        self.conversations: dict[str, list[dict[str, Any]]] = {}
        self.marks: list[dict[str, Any]] = []
        self.asked: list[dict[str, Any]] = []
        self.lock = threading.Lock()
        self.port = 0

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


def _collection(collection_id: int, name: str, documents_to: str | None) -> dict[str, Any]:
    return {
        "id": collection_id,
        "name": name,
        "pipeline": "text",
        "status": "active",
        "owner_project_id": 1,
        "profile": None,
        "document_count": 1,
        "type_counts": {},
        "documents_to": documents_to,
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

    def _authorised(self) -> bool:
        if (self.headers.get("Authorization") or "").startswith("Bearer ") and len(self.headers["Authorization"]) > 7:
            return True
        self._send(401, {"error": "unauthorized", "message": "no bearer"})
        return False

    def _body(self) -> dict[str, Any]:
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        kind = self.headers.get("Content-Type") or ""
        if kind.startswith("multipart/form-data"):
            fields: dict[str, Any] = {}
            for name, value in re.findall(
                rb'name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:[^\r\n]+\r\n)*\r\n(.*?)\r\n--', raw, re.S
            ):
                fields.setdefault(name.decode(), value.decode(errors="replace"))
            return fields
        loaded: dict[str, Any] = json.loads(raw or b"{}")
        return loaded

    def do_GET(self) -> None:
        if not self._authorised():
            return
        path = self.path.split("?")[0]
        if match := re.fullmatch(r"/conversations/([^/]+)", path):
            with self.fake.lock:
                turns = self.fake.conversations.get(match[1])
            if turns is None:
                self._send(404, {"error": "not_found", "message": "no such conversation"})
            else:
                self._send(200, {"session_id": match[1], "turns": turns})
        elif match := re.fullmatch(r"/documents/(\d+)", path):
            found = {DOCUMENT_ID: COLLECTION, OUTSIDE_ID: ELSEWHERE}.get(int(match[1]))
            if found is None:
                self._send(404, {"error": "not_found", "message": "no such document"})
            else:
                self._send(200, _document(int(match[1]), found))
        elif path == "/collections":
            self._send(200, [_collection(1, COLLECTION, DOCUMENTS_TO), _collection(2, ELSEWHERE, "2026-09-20")])
        else:
            self._send(404, {"error": "not_found", "message": path})

    def do_DELETE(self) -> None:
        if not self._authorised():
            return
        match = re.fullmatch(r"/conversations/([^/]+)", self.path)
        with self.fake.lock:
            gone = match is not None and self.fake.conversations.pop(match[1], None) is not None
        self._send(204) if gone else self._send(404, {"error": "not_found", "message": "absent"})

    def do_POST(self) -> None:
        if not self._authorised():
            return
        body = self._body()
        if self.path == "/ask/feedback":
            with self.fake.lock:
                known = body.get("session_id") in self.fake.conversations
                if known:
                    self.fake.marks.append(body)
            self._send(200, body) if known else self._send(404, {"error": "not_found", "message": "absent"})
        elif self.path == "/ask":
            self._ask(body)
        else:
            self._send(404, {"error": "not_found", "message": self.path})

    def _frame(self, event: dict[str, Any]) -> None:
        data = f"data: {json.dumps(event)}\n\n".encode()
        self.wfile.write(f"{len(data):x}\r\n".encode() + data + b"\r\n")
        self.wfile.flush()

    def _ask(self, body: dict[str, Any]) -> None:
        question = str(body.get("question") or "")
        resume = body.get("resume")
        with self.fake.lock:
            self.fake.asked.append(body)
            if resume and resume not in self.fake.conversations:
                self._send(404, {"error": "not_found", "message": "not this caller's conversation"})
                return
        session_id = resume or str(uuid.uuid4())
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        try:
            if QUEUED_TRIGGER in question:
                for _ in range(2):
                    self._frame({"type": "queued", "message": "another question is being answered first"})
                    time.sleep(max(self.fake.pace * 20, 0.2))
            self._frame({"type": "system", "subtype": "init", "session_id": session_id, "model": "milton"})
            if HANG_TRIGGER in question:
                while True:  # until the asker hangs up, which the next write finds
                    time.sleep(0.2)
                    self._frame({"type": "stream_event", "event": {"type": "ping"}})
            asked = question.rsplit("\n\n", 1)[-1]
            answer = (
                f"On {asked.rstrip('?').lower()}: a member accrues four weeks of recreation leave "
                "each year of service [1], and long service leave after ten years [1]."
            )
            self._stream(answer)
            citation = {
                "n": 1,
                "document_id": DOCUMENT_ID,
                "title": "The Manual, Part 5: Leave",
                "section": "5.1 Recreation leave",
                "anchor": "5-1",
                "snippet": "A member accrues four weeks a year.",
            }
            self._frame({"type": "assistant", "message": {"content": [{"type": "text", "text": answer}]}})
            self._frame(
                {
                    "type": "result",
                    "subtype": "success",
                    "session_id": session_id,
                    "result": answer,
                    "duration_ms": 1200,
                    "total_cost_usd": 0.0321,
                }
            )
            self._frame({"type": "citations", "items": [citation]})
            with self.fake.lock:
                self.fake.conversations.setdefault(session_id, []).append(
                    {
                        "question": question,
                        "answer": answer,
                        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "citations": [citation],
                    }
                )
            self.wfile.write(b"0\r\n\r\n")
        except BrokenPipeError, ConnectionResetError:
            return

    def _stream(self, answer: str) -> None:
        self._frame({"type": "stream_event", "event": {"type": "message_start"}})
        start = {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}
        self._frame({"type": "stream_event", "event": start})
        for word in re.findall(r"\S+\s*", answer):
            time.sleep(self.fake.pace)
            delta = {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": word}}
            self._frame({"type": "stream_event", "event": delta})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=18766)
    parser.add_argument("--pace", type=float, default=0.05)
    options = parser.parse_args()
    FakeLibrary(options.pace).serve(options.port)
    threading.Event().wait()
