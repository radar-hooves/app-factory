"""The stamped deploy's image-input gate, `template/.github/image-inputs.sh`.

Run against real BuildKit and the factory's own .dockerignore, with `gh` faked to
name the last live commit.
"""

import os
import subprocess
from pathlib import Path

import pytest

TEMPLATE = Path(__file__).parents[2] / "template"
SCRIPT = TEMPLATE / ".github" / "image-inputs.sh"

# An app's tail re-including a path the factory's section excludes.
TAIL = "!docs/modules\n!docs/modules/**\n"


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def commit(repo: Path, files: dict[str, str | None]) -> str:
    for path, text in files.items():
        target = repo / path
        if text is None:
            target.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "change")
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def app(tmp_path: Path) -> tuple[Path, str]:
    repo = tmp_path / "app"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    live = commit(
        repo,
        {
            ".dockerignore": (TEMPLATE / ".dockerignore").read_text() + TAIL,
            "Dockerfile": "FROM scratch\n",
            "README.md": "app\n",
            "backend/src/app.py": "x = 1\n",
            "docs/modules/m.md": "module\n",
            "docs/notes.md": "notes\n",
        },
    )
    return repo, live


def decide(repo: Path, live: str, event: str = "push") -> str:
    bin_dir = repo.parent / "bin"
    bin_dir.mkdir(exist_ok=True)
    gh = bin_dir / "gh"
    gh.write_text(f"#!/bin/sh\necho '{live}'\n")
    gh.chmod(0o755)
    output = repo.parent / "output"
    output.write_text("")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "GITHUB_OUTPUT": str(output),
        "GITHUB_EVENT_NAME": event,
        "GITHUB_REPOSITORY": "owner/app",
    }
    env.pop("GITHUB_STEP_SUMMARY", None)
    subprocess.run(["bash", str(SCRIPT)], cwd=repo, env=env, check=True, capture_output=True)
    return output.read_text().strip()


@pytest.mark.parametrize(
    ("files", "changed"),
    [
        (
            {
                "docs/notes.md": "more",
                "README.md": "more",
                "CHANGELOG.md": "more",
                ".claude/handoff.md": "next",
                ".github/workflows/security.yaml": "on: push",
            },
            "false",
        ),
        ({"backend/src/app.py": "x = 2\n"}, "true"),
        ({"docs/modules/m.md": "served\n"}, "true"),
        ({"backend/src/app.py": None}, "true"),
        ({"Dockerfile": "FROM scratch\nCOPY . /\n"}, "true"),
        ({".dockerignore": TAIL}, "true"),
        ({".github/workflows/deploy.yaml": "on: push"}, "true"),
    ],
    ids=["docs-and-ci", "code", "app-re-include", "deletion", "dockerfile", "dockerignore", "deploy-workflow"],
)
def test_a_push_ships_only_when_an_image_input_changed(
    app: tuple[Path, str], files: dict[str, str | None], changed: str
) -> None:
    repo, live = app
    commit(repo, files)
    assert decide(repo, live) == f"changed={changed}"


def test_a_change_after_the_live_commit_is_never_stepped_over(app: tuple[Path, str]) -> None:
    # The code commit's own run was cancelled while queued; the docs push after
    # it must still ship it.
    repo, live = app
    commit(repo, {"backend/src/app.py": "x = 3\n"})
    commit(repo, {"docs/notes.md": "later"})
    assert decide(repo, live) == "changed=true"


def test_the_live_commit_itself_ships_nothing(app: tuple[Path, str]) -> None:
    repo, live = app
    assert decide(repo, live) == "changed=false"


@pytest.mark.parametrize(
    ("live", "event"),
    [("", "push"), ("0" * 40, "push"), (None, "workflow_dispatch")],
    ids=["no-live-run", "live-commit-not-in-history", "dispatch"],
)
def test_anything_it_cannot_establish_ships(app: tuple[Path, str], live: str | None, event: str) -> None:
    repo, live_commit = app
    commit(repo, {"docs/notes.md": "more"})
    assert decide(repo, live_commit if live is None else live, event) == "changed=true"
