"""`headless` is the factory's own shape for an app with no front end: one answer, one render."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COPIER = yaml.safe_load((ROOT / "copier.yaml").read_text())
BRANCH = re.compile(r"\{%-? *(?:el)?if [^%]*(?:headless|omitted_slices)")
FRONTEND_QUESTIONS = ("team_name", "dark_first", "factory_fonts", "density", "frontend_port", "frontend_e2e_port")


def test_headless_defaults_to_a_front_end() -> None:
    assert COPIER["headless"]["default"] is False


def test_headless_is_asked_of_web_apps_only() -> None:
    assert "skeleton == 'web'" in COPIER["headless"]["when"]


def test_no_frontend_question_is_asked_of_a_headless_app() -> None:
    assert {name: "not headless" in str(COPIER[name].get("when")) for name in FRONTEND_QUESTIONS} == dict.fromkeys(
        FRONTEND_QUESTIONS, True
    )


def test_a_headless_render_carries_no_frontend() -> None:
    assert "{% if headless %}frontend{% endif %}" in COPIER["_exclude"]


def test_every_file_that_branches_on_the_shape_is_a_template() -> None:
    """A file outside `.jinja` would stamp `{% if headless %}` or a slice's condition literally."""
    raw = [
        p.relative_to(ROOT).as_posix()
        for p in (ROOT / "template").rglob("*")
        if p.is_file() and p.suffix != ".jinja" and BRANCH.search(p.read_text(errors="ignore"))
    ]
    assert raw == []
