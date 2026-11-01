"""The stale-vocabulary migration rewrites a retired extension-point header and prunes dead parity rows."""

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG = yaml.safe_load((ROOT / "copier.yaml").read_text())
STEP = next(s for s in CONFIG["_migrations"] if s["command"][:2] == ["python3", "-c"])
TEMPLATE_APP_TS = (ROOT / "template/frontend/src/lib/agent/app.ts").read_text()
STALE = "/**\n * THIS app's room pages: `RoomExtensions` from `$lib/agent/rooms`.\n */\nexport {};\n"


def run(tmp: Path) -> None:
    subprocess.run([sys.executable, "-c", STEP["command"][2]], cwd=tmp, check=True)


def test_stale_header_becomes_the_templates(tmp_path: Path) -> None:
    app = tmp_path / "frontend/src/lib/agent/app.ts"
    app.parent.mkdir(parents=True)
    app.write_text(STALE)
    run(tmp_path)
    assert app.read_text() == TEMPLATE_APP_TS


def test_an_apps_own_header_stands(tmp_path: Path) -> None:
    app = tmp_path / "frontend/src/lib/agent/app.ts"
    app.parent.mkdir(parents=True)
    own = "/** Mine. */\nexport const copy = {};\n"
    app.write_text(own)
    run(tmp_path)
    assert app.read_text() == own


def test_dead_rooms_rows_leave_the_parity_manifest(tmp_path: Path) -> None:
    files = {
        "backend/src/{package}/api/agent/rooms.py": "a",
        "frontend/src/lib/agent/rooms.ts": "b",
        "frontend/src/routes/(protected)/rooms/[room]/+page.ts": "c",
        "frontend/src/lib/agent/chat.ts": "d",
    }
    (tmp_path / ".template-parity.json").write_text(json.dumps({"files": files}, indent=2) + "\n")
    run(tmp_path)
    kept = json.loads((tmp_path / ".template-parity.json").read_text())["files"]
    assert list(kept) == ["frontend/src/lib/agent/chat.ts"]


def test_the_migration_is_keyed_on_a_release_that_exists_once() -> None:
    assert re.fullmatch(r"v\d{4}\.\d+\.\d+", STEP["version"])
