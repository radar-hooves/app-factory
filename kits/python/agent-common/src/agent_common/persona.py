"""Load a persona from its directory, and seed its writable home.

The persona contract (full-stack-app-template `docs/design/agent-console.md`
§The persona contract): a directory shaped as a Claude Code home — `CLAUDE.md`
(who it is), `settings.json` (`model`, `permissions.allow`, `permissions.deny`,
hooks) and `.mcp.json` (the servers it holds). Nothing here caches a persona
between calls: it is read fresh on every spawn, so an edit reaches the very
next turn with no restart.

Which directory holds the personas and where their homes live are the
caller's: an app passes its own `config/personas/` and a folder under its own
`data/`, and answers a missing persona in its own vocabulary.
"""

import json
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

#: The files a persona directory may carry, copied into its writable home in
#: this order. CLAUDE.md is the only one a persona MUST have — it is what
#: marks a directory as a persona at all (`names`).
SOURCE_FILES = ("CLAUDE.md", "settings.json", ".mcp.json")


class PersonaNotFound(LookupError):
    """No persona directory of that name carries a CLAUDE.md."""


@dataclass(frozen=True, slots=True)
class Persona:
    """One persona's identity and permissions, and where its writable home is.

    `allowed_tools` and `disallowed_tools` are comma-joined tool lists,
    already shaped for `--allowedTools`/`--disallowedTools` — derived from
    settings.json's own `permissions.allow`/`permissions.deny` so the file
    and the flags that enforce it under `--permission-mode bypassPermissions`
    can never disagree.
    """

    name: str
    home: Path
    allowed_tools: str
    disallowed_tools: str

    @property
    def mcp_config(self) -> Path | None:
        """The seeded `.mcp.json`, or None when this persona shipped none."""
        candidate = self.home / ".mcp.json"
        return candidate if candidate.is_file() else None


def names(personas_dir: Path) -> list[str]:
    """Every persona under `personas_dir`. Empty means no console renders.

    A directory counts only once it has a `CLAUDE.md` — the one file that is
    not optional, because it is what says the directory is a persona rather
    than stray content beside the real ones.
    """
    if not personas_dir.is_dir():
        return []
    return sorted(child.name for child in personas_dir.iterdir() if child.is_dir() and (child / "CLAUDE.md").is_file())


def _copy_shipped_files(source: Path, target: Path) -> None:
    """Copy each shipped file into `target`, overwriting whatever is there."""
    for filename in SOURCE_FILES:
        candidate = source / filename
        if candidate.is_file():
            shutil.copy2(candidate, target / filename)


def _reseed_shipped_files(source: Path, home: Path) -> None:
    """Re-copy each shipped file over an already-seeded `home`, file by file.

    `home` is live — the CLI's own state (sessions, projects, backups, its
    own json files) lives beside these three and must survive untouched — so
    it cannot be rebuilt wholesale the way a fresh home is. Each file is
    staged as a sibling temp file and renamed over the old one, so a
    concurrent `load()`'s `json.loads` below only ever sees the whole old
    file or the whole new one, the same rename-into-place atomicity the
    fresh-home path gets from staging the entire directory.
    """
    for filename in SOURCE_FILES:
        candidate = source / filename
        if not candidate.is_file():
            continue
        fd, staged_name = tempfile.mkstemp(prefix=f".{filename}.", dir=home)
        os.close(fd)
        staged = Path(staged_name)
        shutil.copy2(candidate, staged)
        os.replace(staged, home / filename)


def _seed(source: Path, home: Path) -> None:
    """Copy a persona's shipped files into its writable home, every spawn.

    `SOURCE_FILES` reach every spawn fresh: an edit to the persona's own
    `CLAUDE.md`, `settings.json` or `.mcp.json` overwrites the copy in `home`
    on the very next ask, so the contract's "read at every spawn" holds of the
    home Claude Code actually reads and not only of the source (Milton's
    `settings.json` on atlas once kept `goku/sonnet` through a release that
    changed it). Everything else in `home` — the CLI's own state — is never in
    `SOURCE_FILES` and is left alone.

    A fresh home is built in a private staging directory and renamed into
    place, so two workers seeding the same persona at once never expose a
    half-written `settings.json` to `load()`'s `json.loads` below: `home`
    either does not exist yet or is already complete.
    """
    if home.is_dir():
        _reseed_shipped_files(source, home)
        return

    home.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{home.name}.", dir=home.parent))
    _copy_shipped_files(source, staging)
    try:
        os.rename(staging, home)
    except OSError:
        # Lost the race: another worker's `home` already exists, complete.
        # Treat that as done rather than retrying the copy into it.
        if not home.is_dir():
            raise
        shutil.rmtree(staging, ignore_errors=True)


def _tool_list(settings_json: dict[str, object], key: str) -> str:
    permissions = settings_json.get("permissions", {})
    tools = permissions.get(key, []) if isinstance(permissions, dict) else []
    return ",".join(str(tool) for tool in tools) if isinstance(tools, list) else ""


def load(personas_dir: Path, name: str, homes_dir: Path) -> Persona:
    """Load `name` from `personas_dir` and seed its writable home, `homes_dir / name`.

    Raises:
        PersonaNotFound: no directory named `name` under `personas_dir` carries a CLAUDE.md.
    """
    source = personas_dir / name
    if not (source / "CLAUDE.md").is_file():
        raise PersonaNotFound(f"no such persona: {name}")

    home = homes_dir / name
    _seed(source, home)

    settings_path = home / "settings.json"
    settings_json = json.loads(settings_path.read_text()) if settings_path.is_file() else {}

    return Persona(
        name=name,
        home=home,
        allowed_tools=_tool_list(settings_json, "allow"),
        disallowed_tools=_tool_list(settings_json, "deny"),
    )
