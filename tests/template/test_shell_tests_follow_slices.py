"""A factory test whose subject is absent is left out of the stamp, never shipped to skip."""

from pathlib import Path

import pytest
from render import render

SHELL_TEST = "frontend/src/lib/shell.test.ts"
SHELL_SPEC = "frontend/tests/e2e/shell.spec.ts"


@pytest.mark.parametrize(("omitted", "present"), [("[feedback]", True), ("[agent, alerts, files]", False)])
def test_the_chat_hand_off_test_exists_only_with_the_agent_slice(tmp_path: Path, omitted: str, present: bool) -> None:
    text = (render(tmp_path / "app", omitted_slices=omitted) / SHELL_TEST).read_text()
    assert ("asks the chat persona what was typed" in text) is present
    assert "hasChat" not in text
    assert "skipIf" not in text


def test_the_shell_spec_never_skips_at_run_time(tmp_path: Path) -> None:
    text = (render(tmp_path / "app") / SHELL_SPEC).read_text()
    assert "test.skip(" not in text
