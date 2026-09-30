"""A persona is read fresh from its directory and seeded into a writable home that survives the CLI's own state."""

import json
import shutil
import threading
from collections.abc import Callable
from pathlib import Path

import pytest
from agent_common import persona
from agent_common.persona import Persona, PersonaNotFound


def test_names_are_the_directories_carrying_a_claude_md(personas_dir: Path, write_persona: Callable[..., Path]) -> None:
    write_persona(personas_dir, "penny")
    (personas_dir / "stray").mkdir()
    assert persona.names(personas_dir) == ["milton", "penny"]


def test_no_personas_directory_names_none(tmp_path: Path) -> None:
    assert persona.names(tmp_path / "absent") == []


def test_a_persona_with_no_directory_is_not_found(personas_dir: Path, tmp_path: Path) -> None:
    with pytest.raises(PersonaNotFound):
        persona.load(personas_dir, "nobody", tmp_path / "homes")


def test_load_seeds_the_home_and_derives_the_tool_flags_from_settings_json(personas_dir: Path, tmp_path: Path) -> None:
    loaded = persona.load(personas_dir, "milton", tmp_path / "homes")

    assert loaded.home == tmp_path / "homes" / "milton"
    assert (loaded.home / "CLAUDE.md").read_text() == "You are milton."
    assert loaded.allowed_tools == "Read,Grep"
    assert loaded.disallowed_tools == "Bash"
    assert loaded.mcp_config == loaded.home / ".mcp.json"


def test_a_persona_with_no_mcp_json_has_no_mcp_config(tmp_path: Path, write_persona: Callable[..., Path]) -> None:
    write_persona(tmp_path / "personas", "quiet", mcp=False)
    assert persona.load(tmp_path / "personas", "quiet", tmp_path / "homes").mcp_config is None


def test_an_edit_reaches_the_next_load_and_the_clis_own_state_survives_it(personas_dir: Path, tmp_path: Path) -> None:
    first = persona.load(personas_dir, "milton", tmp_path / "homes")
    (first.home / "projects").mkdir()
    (first.home / "projects" / "kept.jsonl").write_text("{}")

    (personas_dir / "milton" / "settings.json").write_text(
        json.dumps({"model": "opus", "permissions": {"allow": ["Read"]}})
    )
    second = persona.load(personas_dir, "milton", tmp_path / "homes")

    assert json.loads((second.home / "settings.json").read_text())["model"] == "opus"
    assert second.allowed_tools == "Read"
    assert second.disallowed_tools == ""
    assert (second.home / "projects" / "kept.jsonl").is_file()


def test_a_concurrent_seed_of_one_persona_from_two_threads_leaves_one_intact_home(
    personas_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Two workers seeding one persona's home at once must never race.

    `shutil.copy2` truncates its destination the instant it opens it, before a
    single byte of content is written, so `target.exists()` turns true well
    before the file is complete. Reproduced deterministically by pausing the
    first thread's copy right at that instant, rather than hoping real OS
    scheduling happens to land there.
    """
    truncated = threading.Event()
    second_call_done = threading.Event()
    original_copy2 = shutil.copy2

    def _copy2_paused_after_truncating_settings_json(src: Path, dst: Path) -> object:
        if Path(dst).name == "settings.json" and not truncated.is_set():
            Path(dst).write_bytes(b"")
            truncated.set()
            second_call_done.wait(timeout=5)
        return original_copy2(src, dst)

    monkeypatch.setattr(shutil, "copy2", _copy2_paused_after_truncating_settings_json)

    results: list[Persona | Exception] = []

    def _seed_first() -> None:
        try:
            results.append(persona.load(personas_dir, "milton", tmp_path / "homes"))
        except Exception as exc:
            results.append(exc)

    def _load_second() -> None:
        truncated.wait(timeout=5)
        try:
            results.append(persona.load(personas_dir, "milton", tmp_path / "homes"))
        except Exception as exc:
            results.append(exc)
        finally:
            second_call_done.set()

    first = threading.Thread(target=_seed_first)
    second = threading.Thread(target=_load_second)
    first.start()
    second.start()
    first.join()
    second.join()

    assert all(isinstance(result, Persona) for result in results), results

    home = tmp_path / "homes" / "milton"
    assert json.loads((home / "settings.json").read_text())["model"] == "sonnet"
    assert (home / "CLAUDE.md").read_text() == "You are milton."
