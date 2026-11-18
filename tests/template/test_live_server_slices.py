"""The live-server harness is rendered only while an agent-jobs or commit-ordering test can read it."""

from pathlib import Path

import pytest
from render import render

HARNESS = "backend/tests/support/live_server.py"


@pytest.mark.parametrize(
    ("omitted", "present"),
    [("[agent, alerts, feedback, files]", False), ("[feedback]", True), ("[agent, alerts, files]", True)],
)
def test_the_harness_leaves_with_both_of_its_readers(tmp_path: Path, omitted: str, present: bool) -> None:
    app = render(tmp_path / "app", omitted_slices=omitted)
    assert (app / HARNESS).exists() is present
