"""A factory migration never names an app's revision, so `copier update` needs no repointing."""

import ast
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[2] / "template" / "backend" / "alembic" / "versions"
LAST_CHAINED = "e1f7a3b4c5d6"
FIELDS = {"revision", "down_revision", "branch_labels", "depends_on"}


def _as_set(value: object) -> set[str]:
    if value is None:
        return set()
    return {value} if isinstance(value, str) else set(value)  # type: ignore[arg-type]


def _revisions(versions: Path) -> dict[str, dict[str, set[str]]]:
    """revision id -> its down_revision, branch_labels and depends_on, as written."""
    found = {}
    for path in versions.glob("*.py"):
        fields = {}
        for node in ast.parse(path.read_text()).body:
            target = (
                node.target
                if isinstance(node, ast.AnnAssign)
                else (node.targets[0] if isinstance(node, ast.Assign) else None)
            )
            if isinstance(target, ast.Name) and target.id in FIELDS and node.value is not None:
                fields[target.id] = _as_set(ast.literal_eval(node.value))
        found[next(iter(fields["revision"]))] = fields
    return found


def _ancestors(revs: dict[str, dict[str, set[str]]], rev: str) -> set[str]:
    out = {rev}
    for parent in revs[rev]["down_revision"]:
        out |= _ancestors(revs, parent)
    return out


def breaches(versions: Path) -> list[str]:
    """What a factory revision after the hand-chained ones does that an app would have to repoint."""
    revs = _revisions(versions)
    assert LAST_CHAINED in revs, "the last hand-chained factory revision is gone"
    later = set(revs) - _ancestors(revs, LAST_CHAINED)
    roots = [r for r in later if not revs[r]["down_revision"]]
    found = [f"{r} chains onto {p}" for r in later for p in revs[r]["down_revision"] if p not in later]
    found += [
        f"{r} depends on {d}, not the factory"
        for r in later
        for d in revs[r]["depends_on"]
        if d not in later | _ancestors(revs, LAST_CHAINED)
    ]
    found += [
        f"{r} starts the branch without its label or without depending on {LAST_CHAINED}"
        for r in roots
        if "factory" not in revs[r]["branch_labels"] or LAST_CHAINED not in revs[r]["depends_on"]
    ]
    found += [
        f"{r} labels a branch it does not start" for r in later if revs[r]["down_revision"] and revs[r]["branch_labels"]
    ]
    if len(roots) > 1:
        found.append(f"{len(roots)} roots: {sorted(roots)}")
    return found


def test_the_template_chain_holds_the_rule() -> None:
    assert breaches(VERSIONS) == []


def _write(directory: Path, name: str, down: str, labels: str = "None", depends: str = "None") -> None:
    (directory / f"{name}.py").write_text(
        f'revision: str = "{name}"\ndown_revision: str | None = {down}\nbranch_labels = {labels}\ndepends_on = {depends}\n'
    )


def test_a_factory_revision_chained_onto_the_last_hand_chained_one_is_caught(tmp_path: Path) -> None:
    _write(tmp_path, LAST_CHAINED, "None")
    _write(tmp_path, "later", f'"{LAST_CHAINED}"')
    assert any("later chains onto" in b for b in breaches(tmp_path))


def test_a_second_unlabelled_root_is_caught(tmp_path: Path) -> None:
    _write(tmp_path, LAST_CHAINED, "None")
    _write(tmp_path, "stray", "None", depends=f'"{LAST_CHAINED}"')
    assert any("without its label" in b for b in breaches(tmp_path))


def test_a_labelled_root_depending_on_the_last_chained_one_is_clean(tmp_path: Path) -> None:
    _write(tmp_path, LAST_CHAINED, "None")
    _write(tmp_path, "first", "None", '("factory",)', f'"{LAST_CHAINED}"')
    _write(tmp_path, "second", '"first"')
    assert breaches(tmp_path) == []
