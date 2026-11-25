"""An update never leaves a second file for a revision an app already tracks."""

import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
TASK = next(
    t
    for t in yaml.safe_load((ROOT / "copier.yaml").read_text())["_tasks"]
    if "alembic/versions" in "".join(t["command"])
)


def _migration(path: Path, rev: str) -> None:
    path.write_text(f'revision: str = "{rev}"\n')


def test_untracked_copy_of_a_tracked_revision_is_removed(tmp_path: Path) -> None:
    versions = tmp_path / "backend/alembic/versions"
    versions.mkdir(parents=True)
    _migration(versions / "20261005_1800_aaa111_own_name.py", "aaa111")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True)
    _migration(versions / "20260930_1400_aaa111_factory_name.py", "aaa111")
    _migration(versions / "20261101_0000_bbb222_new.py", "bbb222")
    subprocess.run(TASK["command"], cwd=tmp_path, check=True)
    assert sorted(p.name for p in versions.iterdir()) == [
        "20261005_1800_aaa111_own_name.py",
        "20261101_0000_bbb222_new.py",
    ]
