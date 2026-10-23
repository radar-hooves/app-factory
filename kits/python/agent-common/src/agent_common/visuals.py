"""What a persona is told of the visuals its page draws inside an answer.

A visual is a fenced block of a language the app's page draws with its own
component. `FRAGMENTS` is the factory's wording per language, measured in
caspo's spike; a persona's own `<language>.md` beside its files supplies or
overrides one, for a renderer an app adds.
"""

import re
from collections.abc import Sequence
from pathlib import Path

_NAME = re.compile(r"[A-Za-z0-9_-]+")

LEAD = """\
Visuals. Write ordinary Markdown. Be brief: a short lead sentence, then the visual that carries the answer, \
then at most two sentences of caveat. Use a visual only when it carries the answer better than a sentence. \
To draw a visual, use one of these. Each fenced block is valid JSON and nothing else."""

FRAGMENTS: dict[str, str] = {
    "table": "- A comparison across rows and columns: a Markdown table.",
    "chart": (
        '- A chart of numbers: a fenced block tagged chart holding {"title": string, "type": "bar" | "line" | '
        '"area", "x": string, "y": [string], "data": [object]}. x names the field on the horizontal axis; y names '
        "one to five fields of numbers, one series each; data has one object per x carrying those fields. Write "
        "dates as YYYY-MM-DD. No colours, fonts or sizes; the app styles it."
    ),
    "timeline": (
        '- Dated events: a fenced block tagged timeline holding {"title": string, "events": '
        '[{"date": string, "title": string, "detail": string}]}, oldest first.'
    ),
    "card": (
        "- One entity (vendor, programme, platform): a fenced block tagged card holding "
        '{"name": string, "kind": string, "summary": string, "facts": [{"label": string, "value": string}]}.'
    ),
}


def fragment(language: str, own: Path | None = None) -> str:
    """The persona's own fragment for `language` where `own` holds one, else the factory's.

    Raises:
        ValueError: neither has one.
    """
    if own is not None and _NAME.fullmatch(language):
        path = own / f"{language}.md"
        if path.is_file():
            return path.read_text().strip()
    if language in FRAGMENTS:
        return FRAGMENTS[language]
    raise ValueError(f"no prompt fragment for the visual {language!r}")


def guidance(languages: Sequence[str], own: Path | None = None) -> str:
    """The lead and each language's fragment, in order; empty for none.

    Raises:
        ValueError: a language has no fragment in `own` or `FRAGMENTS`.
    """
    if not languages:
        return ""
    return "\n".join([LEAD, *(fragment(language, own) for language in languages)])
