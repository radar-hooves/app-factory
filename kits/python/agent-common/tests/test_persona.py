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


# ── imports, expanded app-side for a restricted turn ─────────────────────


def _seeded_with_import(tmp_path: Path, claude_md: str) -> Persona:
    """A persona whose CLAUDE.md imports from a `company/` tree beside `data/`, as a deployed app's does."""
    source = tmp_path / "app" / "config" / "personas" / "peggy"
    source.mkdir(parents=True)
    (source / "CLAUDE.md").write_text(claude_md)
    return persona.load(tmp_path / "app" / "config" / "personas", "peggy", tmp_path / "app" / "data" / "agent-homes")


def test_a_thin_claude_md_is_expanded_from_the_file_its_seeded_home_names(tmp_path: Path) -> None:
    agents = tmp_path / "app" / "company" / "agents"
    agents.mkdir(parents=True)
    (agents / "peggy.md").write_text("You file documents.\n@tone.md\n")
    (agents / "tone.md").write_text("Speak plainly.\n")
    loaded = _seeded_with_import(tmp_path, "# Peggy\n\n@../../../company/agents/peggy.md\n")

    assert loaded.instructions == "# Peggy\n\n@../../../company/agents/peggy.md\n"
    assert loaded.brief() == "# Peggy\n\nYou file documents.\nSpeak plainly.\n"


def test_a_nested_brief_imports_its_siblings_as_list_items(tmp_path: Path) -> None:
    penny = tmp_path / "app" / "company" / "agents" / "penny"
    penny.mkdir(parents=True)
    (penny / "A02-system-prompt.md").write_text(
        "Read with:\n- @A01-agent-intent.md\n- @A03-authority.md\n\nTriage the accounts@ mailbox.\n"
    )
    (penny / "A01-agent-intent.md").write_text("Intent.\n")
    (penny / "A03-authority.md").write_text("Authority.\n")
    loaded = _seeded_with_import(tmp_path, "# Penny\n\n@../../../company/agents/penny/A02-system-prompt.md\n")
    assert loaded.brief() == "# Penny\n\nRead with:\n- Intent.\n- Authority.\n\nTriage the accounts@ mailbox.\n"


def test_an_import_in_prose_is_followed_where_it_names_a_file(tmp_path: Path) -> None:
    company = tmp_path / "app" / "company"
    company.mkdir(parents=True)
    (company / "tone.md").write_text("plainly\n")
    loaded = _seeded_with_import(tmp_path, "Speak @../../../company/tone.md and ask @someone.\n")
    assert loaded.brief() == "Speak plainly and ask @someone.\n"


def test_an_import_inside_a_fence_or_a_code_span_is_text(tmp_path: Path) -> None:
    text = "Mail @someone about it.\n```\n@absent.md\n```\n~~~~\n@absent.md\n~~~\n~~~~\n`@absent.md`\nRun ` @absent.md ` here.\n"
    assert _seeded_with_import(tmp_path, text).brief() == text


def test_an_unreadable_list_item_import_is_refused(tmp_path: Path) -> None:
    with pytest.raises(persona.ImportUnreadable, match="absent"):
        _seeded_with_import(tmp_path, "- @absent.md\n").brief()


def test_an_unreadable_import_is_refused_naming_it(tmp_path: Path) -> None:
    loaded = _seeded_with_import(tmp_path, "@../../../company/absent.md\n")
    with pytest.raises(persona.ImportUnreadable, match=r"@\.\./\.\./\.\./company/absent\.md"):
        loaded.brief()


def test_an_import_cycle_is_refused(tmp_path: Path) -> None:
    company = tmp_path / "app" / "company"
    company.mkdir(parents=True)
    (company / "a.md").write_text("@b.md\n")
    (company / "b.md").write_text("@a.md\n")
    with pytest.raises(persona.ImportUnreadable, match="imports itself"):
        _seeded_with_import(tmp_path, "@../../../company/a.md\n").brief()


def test_imports_are_followed_to_claude_codes_depth_and_no_further(tmp_path: Path) -> None:
    company = tmp_path / "app" / "company"
    company.mkdir(parents=True)
    for hop in range(1, persona.IMPORT_DEPTH):
        (company / f"{hop}.md").write_text(f"hop {hop}\n@{hop + 1}.md\n")
    (company / f"{persona.IMPORT_DEPTH}.md").write_text(f"hop {persona.IMPORT_DEPTH}\n")
    loaded = _seeded_with_import(tmp_path, "@../../../company/1.md\n")
    assert loaded.brief() == "".join(f"hop {hop}\n" for hop in range(1, persona.IMPORT_DEPTH + 1))

    (company / f"{persona.IMPORT_DEPTH}.md").write_text(f"@{persona.IMPORT_DEPTH + 1}.md\n")
    (company / f"{persona.IMPORT_DEPTH + 1}.md").write_text("too deep\n")
    with pytest.raises(persona.ImportUnreadable, match="imports deep"):
        loaded.brief()
