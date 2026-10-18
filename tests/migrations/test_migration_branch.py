"""A factory migration never names an app's revision, so `copier update` needs no repointing."""

import re
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[2] / "template" / "backend" / "alembic" / "versions"
LAST_CHAINED = "e1f7a3b4c5d6"


def _field(text: str, name: str) -> str:
    match = re.search(rf"^{name}(?:: [^=]+)? = (.+)$", text, re.MULTILINE)
    assert match, f"no {name}"
    return match.group(1)


def _revisions() -> dict[str, tuple[str, str, str]]:
    """revision id -> (down_revision, branch_labels, depends_on), as written."""
    found = {}
    for path in VERSIONS.glob("*.py"):
        text = path.read_text()
        found[_field(text, "revision").strip("\"'")] = tuple(
            _field(text, name) for name in ("down_revision", "branch_labels", "depends_on")
        )
    return found


def _ancestors(revs: dict[str, tuple[str, str, str]], rev: str) -> set[str]:
    out = {rev}
    parent = revs[rev][0].strip("\"'")
    if parent != "None":
        out |= _ancestors(revs, parent)
    return out


def test_every_factory_revision_after_the_hand_chained_ones_stays_on_the_factory_branch() -> None:
    revs = _revisions()
    assert LAST_CHAINED in revs
    chained = _ancestors(revs, LAST_CHAINED)
    later = set(revs) - chained
    for rev in sorted(later):
        down, labels, depends = revs[rev]
        parent = down.strip("\"'")
        if parent == "None":
            assert "factory" in labels, f"{rev} starts the factory branch without its label"
            assert LAST_CHAINED in depends, f"{rev} must depend on {LAST_CHAINED}"
        else:
            assert parent in later, f"{rev} chains onto {parent}, a revision an app holds its own copy of"
