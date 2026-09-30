"""A persona on disk and driver settings pointed at the fake CLI, for every test that spawns one."""

import json
import os
import stat
from collections.abc import Callable
from pathlib import Path

import pytest
from agent_common import cli, persona
from agent_common.persona import Persona

FAKE_CLAUDE = Path(__file__).parent / "fake_claude.py"


def _write_persona(root: Path, name: str, *, model: str = "sonnet", mcp: bool = True) -> Path:
    """A persona directory: CLAUDE.md, settings.json and, unless `mcp` is off, .mcp.json."""
    directory = root / name
    directory.mkdir(parents=True)
    (directory / "CLAUDE.md").write_text(f"You are {name}.")
    (directory / "settings.json").write_text(
        json.dumps({"model": model, "permissions": {"allow": ["Read", "Grep"], "deny": ["Bash"]}})
    )
    if mcp:
        (directory / ".mcp.json").write_text(json.dumps({"mcpServers": {}}))
    return directory


@pytest.fixture
def write_persona() -> Callable[..., Path]:
    return _write_persona


@pytest.fixture
def personas_dir(tmp_path: Path) -> Path:
    root = tmp_path / "personas"
    _write_persona(root, "milton")
    return root


@pytest.fixture
def milton(personas_dir: Path, tmp_path: Path) -> Persona:
    return persona.load(personas_dir, "milton", tmp_path / "homes")


@pytest.fixture
def settings() -> cli.Settings:
    """The fake CLI, made executable here because a checkout does not always carry the bit."""
    os.chmod(FAKE_CLAUDE, os.stat(FAKE_CLAUDE).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return cli.Settings(service="kit-test-agent", executable=str(FAKE_CLAUDE), timeout_seconds=10.0)
