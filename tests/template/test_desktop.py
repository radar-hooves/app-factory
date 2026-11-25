"""The desktop skeleton: a Tauri app's shell links only what its own stamp ships."""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("dark_first", ["true", "false"])
def test_app_html_links_only_files_the_stamp_ships(tmp_path: Path, dark_first: str) -> None:
    uvx = shutil.which("uvx")
    assert uvx
    answers = {
        "skeleton": "desktop",
        "project_name": "desk",
        "description": "scratch",
        "frontend_port": "1499",
        "bundle_identifier": "com.example.desk",
        "dark_first": dark_first,
    }
    subprocess.run(
        [uvx, "copier", "copy", "--defaults", "--trust", "--vcs-ref=HEAD"]
        + [f"--data={k}={v}" for k, v in answers.items()]
        + [str(ROOT), str(tmp_path)],
        check=True,
        capture_output=True,
    )
    html = (tmp_path / "src/app.html").read_text()
    linked = re.findall(r'(?:src|href)="/?(?:%sveltekit\.assets%/)?([^"]+)"', html)
    assert [p for p in linked if not (tmp_path / "static" / p).is_file()] == []
    assert ("/dark-seed.js" in html) == (dark_first == "true")
