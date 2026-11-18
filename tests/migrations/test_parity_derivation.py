"""The parity manifest is generated on every update; the gate retires exceptions the factory has caught up with."""

import os
import re
import stat
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG = yaml.safe_load((ROOT / "copier.yaml").read_text())
TASK = CONFIG["_tasks"][0]["command"][2]
HOOK = re.search(
    r"id: template-parity\n.*?entry: \|\n\s+python3 -c '\n(.*?)\n\s+'\n",
    (ROOT / "template/.pre-commit-config.yaml.jinja").read_text(),
    re.S,
).group(1)

RETIRABLE = (
    "noise\n\nRETIRABLE — these exceptions no longer describe a difference:\n"
    "  parity:Dockerfile  (2026-11-13 until:2026-12-13 x#1)\n\nmore\n"
)


def fake_gate(bin_dir: Path, stdout: str, code: int = 0) -> Path:
    log = bin_dir / "calls"
    gate = bin_dir / "household-precommit-template-parity"
    gate.write_text(f"#!/bin/sh\necho \"$@\" >> {log}\ncat <<'EOF'\n{stdout}EOF\nexit {code}\n")
    gate.chmod(gate.stat().st_mode | stat.S_IEXEC)
    return log


def run(script: str, cwd: Path, bin_dir: Path) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    return subprocess.run([sys.executable, "-c", script], cwd=cwd, env=env, capture_output=True, text=True)


def test_update_task_generates_the_manifest_in_a_checkout(tmp_path: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = fake_gate(bin_dir, "")
    assert run(TASK, tmp_path, bin_dir).returncode == 0
    assert log.read_text().strip() == "--generate ."


def test_update_task_is_inert_inside_the_gates_own_render(tmp_path: Path) -> None:
    app, bin_dir = tmp_path / "app", tmp_path / "bin"
    app.mkdir()
    bin_dir.mkdir()
    log = fake_gate(bin_dir, "")
    assert run(TASK, app, bin_dir).returncode == 0
    assert not log.exists()


def test_gate_retires_only_the_lines_it_reports(tmp_path: Path) -> None:
    app, bin_dir = tmp_path / "app", tmp_path / "bin"
    app.mkdir()
    bin_dir.mkdir()
    fake_gate(bin_dir, RETIRABLE, code=1)
    kept = "# header\nparity:other.py  2026-11-13  until:2026-12-13  x#2  # why\n"
    (app / ".canonical-exceptions").write_text(kept + "parity:Dockerfile  2026-11-13  until:2026-12-13  x#1  # why\n")
    result = run(HOOK, app, bin_dir)
    assert result.returncode == 1  # the gate's own verdict passes through
    assert (app / ".canonical-exceptions").read_text() == kept


FLOORS = CONFIG["_tasks"][1]["command"][2]
PYPROJECT = 'dependencies = [\n    "api-common[telemetry]>=2026.9.4",\n    "fastapi>=0.140",\n    "mine>=1",\n    "held>=1",\n]\n'
PACKAGE = '{\n\t"dependencies": {\n\t\t"@poodle64/ui": "^2026.11.5",\n\t\t"impeccable": "3.6.0",\n\t\t"bits-ui": "^2.19",\n\t\t"mine": "^1"\n\t}\n}\n'
WANT = '{"deps": {"api-common": ">=2026.9.5", "fastapi": ">=0.139", "held": ">=2", "@poodle64/ui": "^2026.11.11", "impeccable": "3.6.1", "bits-ui": "^2.19"}}'


def floors_app(tmp_path: Path) -> tuple[Path, Path]:
    app, bin_dir = tmp_path / "app", tmp_path / "bin"
    (app / "backend").mkdir(parents=True)
    (app / "frontend").mkdir()
    bin_dir.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=app, check=True)
    (app / "backend/pyproject.toml").write_text(PYPROJECT)
    (app / "frontend/package.json").write_text(PACKAGE)
    (app / ".template-parity.json").write_text(WANT)
    (app / ".canonical-exceptions").write_text("deps:held  2026-11-13  until:2026-12-13  x#1  # why\n")
    for tool in ("uv", "pnpm"):
        fake = bin_dir / tool
        fake.write_text(f'#!/bin/sh\necho "{tool} $@ $(basename $PWD)" >> {bin_dir}/calls\n')
        fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    return app, bin_dir


def test_floors_are_raised_where_short_and_the_changed_locks_resolved(tmp_path: Path) -> None:
    app, bin_dir = floors_app(tmp_path)
    assert run(FLOORS, app, bin_dir).returncode == 0
    py = (app / "backend/pyproject.toml").read_text()
    assert '"api-common[telemetry]>=2026.9.5"' in py  # raised, extras kept
    assert '"fastapi>=0.140"' in py  # above the floor: untouched
    assert '"held>=1"' in py and '"mine>=1"' in py  # excepted, app-only
    pkg = (app / "frontend/package.json").read_text()
    assert '"@poodle64/ui": "^2026.11.11"' in pkg and '"impeccable": "3.6.1"' in pkg
    assert '"mine": "^1"' in pkg
    assert (bin_dir / "calls").read_text().splitlines() == ["uv lock backend", "pnpm install --lockfile-only frontend"]


def test_nothing_short_means_no_edit_and_no_relock(tmp_path: Path) -> None:
    app, bin_dir = floors_app(tmp_path)
    (app / "backend/pyproject.toml").write_text(PYPROJECT.replace("2026.9.4", "2026.9.9"))
    (app / "frontend/package.json").write_text(PACKAGE.replace("2026.11.5", "2026.12.1").replace("3.6.0", "3.7.0"))
    assert run(FLOORS, app, bin_dir).returncode == 0
    assert not (bin_dir / "calls").exists()


def test_floors_task_is_inert_inside_the_gates_own_render(tmp_path: Path) -> None:
    app, bin_dir = floors_app(tmp_path)
    subprocess.run(["rm", "-rf", str(app / ".git")], check=True)
    assert run(FLOORS, app, bin_dir).returncode == 0
    assert (app / "frontend/package.json").read_text() == PACKAGE
