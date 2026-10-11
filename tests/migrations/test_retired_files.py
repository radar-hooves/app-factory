"""The retirement migration deletes every file `_exclude` hides from an app."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG = yaml.safe_load((ROOT / "copier.yaml").read_text())


def test_every_excluded_path_is_migrated() -> None:
    excluded = {
        m.group(1)
        for entry in CONFIG["_exclude"]
        if (m := re.fullmatch(r"\{% if not factory_selftest %\}(.+)\{% endif %\}", entry))
    }
    removed = {arg for step in CONFIG["_migrations"] for arg in step["command"]}
    assert excluded
    assert excluded <= removed, sorted(excluded - removed)


def test_migrations_run_once_after_the_update_of_a_web_app() -> None:
    for step in CONFIG["_migrations"]:
        assert "_stage == 'after'" in step["when"]
        assert "skeleton == 'web'" in step["when"]
