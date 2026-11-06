"""`omitted_slices` is the app's recorded list of factory slices it does not take, and what leaves its render."""

import fnmatch
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "template"


def _question() -> dict:
    return yaml.safe_load((ROOT / "copier.yaml").read_text())["omitted_slices"]


def _slices() -> dict[str, list[str]]:
    return yaml.safe_load((ROOT / "slices.yaml").read_text())


def _template_paths() -> list[str]:
    return [
        re.sub(r"\.jinja$", "", p.relative_to(TEMPLATE).as_posix()).replace("{{package_name}}", "{package}")
        for p in TEMPLATE.rglob("*")
        if p.is_file()
    ]


def test_defaults_to_none() -> None:
    assert _question()["default"] == []


def test_is_a_web_multiselect() -> None:
    q = _question()
    assert q["multiselect"] is True
    assert "skeleton == 'web'" in q["when"]


def test_choices_are_exactly_the_slices_slices_yaml_maps() -> None:
    assert sorted(_question()["choices"]) == sorted(_slices())


RENDERED_OUT = {"agent", "feedback", "alerts", "files"}


def _excluded() -> dict[str, list[str]]:
    """Each slice's `_exclude` entries, as slices.yaml spells a path."""
    out: dict[str, list[str]] = {}
    for entry in yaml.safe_load((ROOT / "copier.yaml").read_text())["_exclude"]:
        if match := re.fullmatch(r"\{% if '(\w+)' in omitted_slices %\}(.+)\{% endif %\}", entry):
            out.setdefault(match[1], []).append(match[2].replace("{{ package_name }}", "{package}"))
    return out


def test_the_slices_nothing_composes_on_are_the_ones_the_render_drops() -> None:
    assert set(_excluded()) == RENDERED_OUT


def test_what_the_render_drops_for_a_slice_is_what_slices_yaml_maps_to_it() -> None:
    slices = _slices()
    stray = [
        (name, path)
        for name, paths in _excluded().items()
        for path in paths
        if not any(fnmatch.fnmatchcase(path, pat) or fnmatch.fnmatchcase(path + "/x", pat) for pat in slices[name])
    ]
    assert stray == []


def test_every_pattern_matches_a_template_file() -> None:
    paths = _template_paths()
    dead = [
        (s, pat)
        for s, pats in _slices().items()
        for pat in pats
        if not pat.startswith("deps:") and not any(fnmatch.fnmatchcase(p, pat) for p in paths)
    ]
    assert dead == []
