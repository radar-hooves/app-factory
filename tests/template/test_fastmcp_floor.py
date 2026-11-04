"""A stamped app's `/mcp` is fastmcp's: the floor must exclude the releases with open advisories."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATCHED = (4, 1, 2)  # GHSA-7xgj-8392-5q4r, GHSA-vqqp-x5qm-5qp4


def test_fastmcp_floor_is_past_both_advisories() -> None:
    text = (ROOT / "template/backend/pyproject.toml.jinja").read_text()
    match = re.search(r'"fastmcp>=(\d+)\.(\d+)\.(\d+)"', text)
    assert match, "fastmcp must be declared with a >= floor"
    assert tuple(map(int, match.groups())) >= PATCHED
