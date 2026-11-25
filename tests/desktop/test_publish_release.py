"""scripts/publish-release.sh publishes only a draft whose latest.json strands no installed copy."""

import json
import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "skeletons/desktop/scripts/publish-release.sh"
REPO = "radar-hooves/desk"
TAG = "v2026.11.2"
URL = f"https://github.com/{REPO}/releases/download/{TAG}/"
FAKE_GH = """#!/usr/bin/env bash
case "$2" in
  download) dir=; prev=; for a in "$@"; do [[ "$prev" == --dir ]] && dir=$a; prev=$a; done; cp "$ASSETS"/* "$dir"/ ;;
  view) [[ -n "$LATEST" ]] && echo "$LATEST" || exit 1 ;;
  edit) nf=; prev=; for a in "$@"; do [[ "$prev" == --notes-file ]] && nf=$a; prev=$a; done
        echo "$*" >> "$CALLS"; cat "$nf" >> "$CALLS" ;;
esac
"""


@pytest.fixture
def release(tmp_path: Path):
    """A draft with a macOS and a Linux leg, and the app's CHANGELOG.md."""
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "Desk_aarch64.app.tar.gz.sig").write_text("SIGMAC")
    (assets / "Desk_2026.11.2_amd64.deb.sig").write_text("SIGDEB")
    platforms = {
        "darwin-aarch64": {"url": URL + "Desk_aarch64.app.tar.gz", "signature": "SIGMAC"},
        "linux-x86_64-deb": {"url": URL + "Desk_2026.11.2_amd64.deb", "signature": "SIGDEB"},
    }
    tools = tmp_path / "tools"
    tools.mkdir()
    (tools / "gh").write_text(FAKE_GH)
    (tools / "gh").chmod(0o755)
    (tmp_path / "CHANGELOG.md").write_text("## [2026.11.2]\n\n- New.\n\n## [2026.11.1]\n\n- Old.\n")

    def run(latest: str = "v2026.11.1") -> tuple[int, str]:
        (assets / "latest.json").write_text(json.dumps({"version": "2026.11.2", "platforms": platforms}))
        calls = tmp_path / "calls"
        calls.write_text("")
        env = {
            **os.environ,
            "PATH": f"{tools}:{os.environ['PATH']}",
            "GITHUB_REPOSITORY": REPO,
            "ASSETS": str(assets),
            "LATEST": latest,
            "CALLS": str(calls),
        }
        done = subprocess.run(["bash", str(SCRIPT), TAG], cwd=tmp_path, env=env, capture_output=True, text=True)
        return done.returncode, calls.read_text()

    return run, platforms, assets, tmp_path


def test_a_complete_feed_publishes_as_latest_with_the_tags_notes(release) -> None:
    run, *_ = release
    code, calls = run()
    assert code == 0
    assert f"release edit {TAG} --repo {REPO}" in calls and "--draft=false --latest\n" in calls
    assert "- New." in calls and "- Old." not in calls


def test_a_platform_lost_from_the_feed_is_refused(release) -> None:
    run, platforms, *_ = release
    del platforms["linux-x86_64-deb"]
    assert run() == (1, "")


def test_a_stale_signature_is_refused(release) -> None:
    run, _, assets, _ = release
    (assets / "Desk_aarch64.app.tar.gz.sig").write_text("REBUILT")
    assert run() == (1, "")


def test_an_older_tag_does_not_take_latest(release) -> None:
    run, *_ = release
    code, calls = run(latest="v2026.11.10")
    assert code == 0 and "--latest=false" in calls


def test_a_tag_without_notes_is_refused(release) -> None:
    run, _, _, root = release
    (root / "CHANGELOG.md").write_text("## [2026.11.1]\n\n- Old.\n")
    assert run() == (1, "")


def test_the_first_release_takes_latest(release) -> None:
    run, *_ = release
    code, calls = run(latest="")
    assert code == 0 and "--latest\n" in calls
