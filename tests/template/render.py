"""Render a scratch app from the committed template, with fixed throwaway answers."""

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ANSWERS = {
    "factory_selftest": "true",
    "project_name": "factory-selftest",
    "description": "scratch",
    "backend_port": "8398",
    "frontend_port": "5198",
    "frontend_e2e_port": "5228",
    "postgres_host": "127.0.0.1",
    "postgres_port": "5432",
    "portcullis_url": "http://127.0.0.1:1",
    "private_index_name": "godswood",
    "private_index_url": "http://127.0.0.1:1/+simple/",
    "registry_host": "registry.invalid",
    "registry_credential_file": "/dev/null",
    "watchtower_url": "http://127.0.0.1:1",
}


def render(dest: Path, **answers: str) -> Path:
    """Render HEAD's `template/` into `dest` (a committed change only: copier reads git)."""
    uvx = shutil.which("uvx")
    assert uvx
    data = [f"--data={k}={v}" for k, v in {**ANSWERS, **answers}.items()]
    subprocess.run(
        [uvx, "copier", "copy", "--defaults", "--trust", "--vcs-ref=HEAD", *data, str(ROOT), str(dest)],
        check=True,
        capture_output=True,
    )
    return dest
