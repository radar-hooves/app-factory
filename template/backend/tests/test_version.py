"""The backend manifest is this repo's single version source; the frontend follows it.

The app ships as ONE artefact — a container image carrying both the Python backend
and the built SvelteKit frontend — so the two manifests must not be able to disagree
about what version that artefact is. Nothing enforces that by construction: the
release step edits two files, and a missed one is invisible until someone reads the
shipped image's frontend manifest.

Drift here is silent and it is the norm, not the exception — which is why this
asserts rather than trusting the release step.
"""

import json
import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

CALVER = re.compile(r"^\d{4}\.\d{1,2}\.\d+$")


def _backend_version() -> str:
    pyproject = tomllib.loads((REPO_ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8"))
    return pyproject["project"]["version"]


def test_backend_version_is_calendar_versioned():
    assert CALVER.match(_backend_version()), "version must be YYYY.M.x with no zero-padded month"


def test_frontend_manifest_matches_the_backend_version():
    package = json.loads((REPO_ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    assert package["version"] == _backend_version()
