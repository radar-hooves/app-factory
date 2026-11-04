"""`run_mode` is the app's recorded run mode: image by default, source by choice."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def _question() -> dict:
    return yaml.safe_load((ROOT / "copier.yaml").read_text())["run_mode"]


def test_run_mode_defaults_to_image() -> None:
    assert _question()["default"] == "image"


def test_run_mode_offers_exactly_image_and_source() -> None:
    assert _question()["choices"] == ["image", "source"]


def test_run_mode_is_asked_of_web_apps_only() -> None:
    assert "skeleton == 'web'" in _question()["when"]
