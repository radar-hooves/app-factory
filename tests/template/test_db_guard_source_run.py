"""`db/guard.py` passes a source-run app's container (checkout mounted, no git binary) and still refuses a checkout."""

import importlib.util
import subprocess
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "template/backend/src/{{package_name}}/db/guard.py.jinja"


@pytest.fixture
def guard(monkeypatch: pytest.MonkeyPatch):
    """The template's guard rendered for package `app`, its environment import stubbed."""
    source = GUARD.read_text().replace("{{ package_name }}", "app")
    env = types.ModuleType("app.db.environment")
    env.DeploymentEnvironment = env.stamped_environment = object  # type: ignore[attr-defined]
    for name in ("app", "app.db"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    monkeypatch.setitem(sys.modules, "app.db.environment", env)
    spec = importlib.util.spec_from_loader("app.db.guard", loader=None)
    module = importlib.util.module_from_spec(spec)
    exec(compile(source, str(GUARD), "exec"), module.__dict__)
    return module


@pytest.fixture
def checkout(tmp_path: Path) -> Path:
    """A checkout whose HEAD is not origin's (origin unreachable), as a seat's branch would be."""
    work = tmp_path / "work"
    (work / "backend").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(work)], check=True)
    subprocess.run(["git", "-C", str(work), "remote", "add", "origin", str(tmp_path / "gone.git")], check=True)
    return work


def test_source_run_container_without_git_passes(guard, checkout, monkeypatch) -> None:
    monkeypatch.setattr(guard.shutil, "which", lambda _name: None)
    monkeypatch.setattr(guard, "_in_container", lambda: True)
    guard.assert_checkout_on_default_branch(backend_dir=checkout / "backend")


def test_checkout_without_git_outside_a_container_is_refused(guard, checkout, monkeypatch) -> None:
    monkeypatch.setattr(guard.shutil, "which", lambda _name: None)
    monkeypatch.setattr(guard, "_in_container", lambda: False)
    monkeypatch.setenv("PATH", "")
    with pytest.raises(guard.ProductionWriteForbiddenError, match="Cannot verify"):
        guard.assert_checkout_on_default_branch(backend_dir=checkout / "backend")


def test_container_with_git_on_an_unverifiable_checkout_is_refused(guard, checkout, monkeypatch) -> None:
    monkeypatch.setattr(guard, "_in_container", lambda: True)
    with pytest.raises(guard.ProductionWriteForbiddenError, match="Cannot verify"):
        guard.assert_checkout_on_default_branch(backend_dir=checkout / "backend")
