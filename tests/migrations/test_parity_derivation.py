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
