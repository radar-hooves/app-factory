"""The android skeleton: a Rootstock suite app, stamped into its own module of rootstock's monorepo."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COPIER = yaml.safe_load((ROOT / "copier.yaml").read_text())
SKELETON = ROOT / "skeletons" / "android"
#: What an android stamp is asked; everything else is web's or desktop's.
ASKED = {"skeleton", "project_name", "project_title"}
EXCLUDES_ANDROID = ("skeleton == 'web'", "skeleton == 'desktop'", "skeleton != 'android'")


def test_android_is_a_skeleton() -> None:
    assert "android" in COPIER["skeleton"]["choices"]


def test_an_android_stamp_is_asked_its_name_and_title_alone() -> None:
    questions = {k: v for k, v in COPIER.items() if not k.startswith("_")}
    asked = {
        name
        for name, q in questions.items()
        if q.get("when") is not False and not any(e in str(q.get("when", "")) for e in EXCLUDES_ANDROID)
    }
    assert asked == ASKED


def test_its_templates_use_only_answers() -> None:
    """rootstock's `:stamp` proof renders `{{answer}}` alone, so it and copier cannot disagree."""
    answers = {"project_name", "project_title", "android_package", "class_prefix"}
    found: list[str] = []
    for p in SKELETON.rglob("*"):
        if not p.is_file() or "_copier_conf" in p.name:
            continue
        rel = p.relative_to(SKELETON).as_posix()
        text = rel + (p.read_text() if p.suffix == ".jinja" else "")
        rest = re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: "" if m.group(1) in answers else m.group(0), text)
        if re.search(r"\{[{%#]", rest):
            found.append(rel)
    assert found == []
