"""The prompt a persona is given for the visuals its page draws."""

from pathlib import Path

import pytest
from agent_common import visuals


def test_no_visual_is_no_guidance() -> None:
    assert visuals.guidance([]) == ""


def test_guidance_is_the_lead_then_each_fragment_in_order() -> None:
    text = visuals.guidance(["chart", "card"])
    assert text.startswith(visuals.LEAD)
    assert text.index("tagged chart") < text.index("tagged card")
    assert "timeline" not in text


def test_every_factory_language_has_a_fragment() -> None:
    assert set(visuals.FRAGMENTS) == {"table", "chart", "timeline", "card"}


def test_a_personas_own_fragment_supplies_or_overrides(tmp_path: Path) -> None:
    (tmp_path / "openui.md").write_text("Write OpenUI Lang.\n")
    (tmp_path / "card.md").write_text("My card.")
    text = visuals.guidance(["openui", "card"], tmp_path)
    assert text.endswith("Write OpenUI Lang.\nMy card.")
    assert "tagged card" not in text


def test_a_language_with_no_fragment_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="mermaid"):
        visuals.guidance(["mermaid"], tmp_path)


def test_a_language_cannot_name_a_path_outside_the_directory(tmp_path: Path) -> None:
    (tmp_path / "secret.md").write_text("no")
    with pytest.raises(ValueError):
        visuals.fragment("../secret", tmp_path / "inner")
