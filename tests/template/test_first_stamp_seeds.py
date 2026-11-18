"""First-stamp seeds render on `copier copy` alone, so an update never re-creates one an app deleted."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SEEDS = [
    "backend/tests/test_example.py",
    "backend/tests/test_workspaces_api.py",
    "frontend/tests/e2e/example.spec.ts",
    "backend/src/{{ package_name }}/api/example",
    "backend/src/{{ package_name }}/config/sections/example.py",
]


def _gated() -> list[str]:
    exclude = yaml.safe_load((ROOT / "copier.yaml").read_text())["_exclude"]
    return [
        m.group(1)
        for e in exclude
        if (m := re.fullmatch(r"\{% if _copier_operation != 'copy' %\}(.+)\{% endif %\}", e))
    ]


def test_scaffold_slice_and_its_tests_are_copy_only() -> None:
    assert set(SEEDS) <= set(_gated())


def test_every_seed_migration_exists_and_is_copy_only() -> None:
    migrations = [g for g in _gated() if g.startswith("backend/alembic/versions/")]
    assert len(migrations) == 5
    for m in migrations:
        assert (ROOT / "template" / (m + ".jinja")).exists() or (ROOT / "template" / m).exists(), m
