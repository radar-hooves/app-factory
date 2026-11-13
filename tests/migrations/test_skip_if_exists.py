"""`_skip_if_exists` names only files this factory ships: copier skips an app-owned file, and the parity gate reads this list as the one list of what an app owns."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG = yaml.safe_load((ROOT / "copier.yaml").read_text())


def _shipped() -> set[str]:
    out: set[str] = set()
    for base in [ROOT / "template", *(ROOT / "skeletons").glob("*")]:
        out |= {re.sub(r"\.jinja$", "", str(p.relative_to(base))) for p in base.rglob("*") if p.is_file()}
    return out


#: Written by the app's own tooling, never shipped; skipped so an update keeps it.
APP_GENERATED = {"frontend/.arbitrary-values-baseline.json"}


def _names(entry: str, shipped: set[str]) -> bool:
    """A file the factory ships, or a directory (trailing slash) holding one."""
    entry = re.sub(r"\{\{\s*package_name\s*\}\}", "{{package_name}}", entry)
    return entry in shipped or (entry.endswith("/") and any(f.startswith(entry) for f in shipped))


def test_every_skipped_file_is_one_the_factory_ships() -> None:
    shipped = _shipped() | APP_GENERATED
    stale = [e for e in CONFIG["_skip_if_exists"] if not _names(e, shipped)]
    assert not stale, stale


def test_the_list_holds_no_duplicate() -> None:
    entries = CONFIG["_skip_if_exists"]
    assert len(entries) == len(set(entries))
