"""Server-sent events as every agent route frames them.

One event per frame, with no `event:` name: the type is inside the payload
where Claude Code puts it, and inventing a second place for it is the
translation `cli` refuses. A chat turn and a job's watch share this framing,
so `@poodle64/librarian`'s transcript renderer needs no second code path for
either.
"""

import json
from typing import Any

MEDIA_TYPE = "text/event-stream"

#: No proxy buffering and no caching, or a turn arrives in one lump at its end.
HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def frame(event: dict[str, Any]) -> str:
    """One event as one SSE frame."""
    return f"data: {json.dumps(event)}\n\n"
