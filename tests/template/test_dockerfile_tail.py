"""The runtime stage is named, so an app's own stages below the marker can build on it."""

import re
from pathlib import Path

from render import render

MARKER = "# App-owned below this line"


def test_the_runtime_stage_is_named_and_last_above_the_marker(tmp_path: Path) -> None:
    text = (render(tmp_path / "app") / "Dockerfile").read_text()
    above = text[: text.index(MARKER)]
    assert re.findall(r"^FROM .*$", above, re.M)[-1].endswith(" AS runtime")


def test_the_image_carries_its_revision_as_an_oci_label(tmp_path: Path) -> None:
    text = (render(tmp_path / "app") / "Dockerfile").read_text()
    assert "LABEL org.opencontainers.image.revision=${GIT_SHA}" in text.split(MARKER)[0]
