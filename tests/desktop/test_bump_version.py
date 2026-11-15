import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "skeletons/desktop/scripts/bump-version.sh"


class BumpVersionTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "src-tauri").mkdir()
        shutil.copy(SCRIPT, self.root / "scripts/bump-version.sh")
        (self.root / "package.json").write_text('{\n\t"name": "demo",\n\t"version": "0.1.0"\n}\n')
        (self.root / "src-tauri/tauri.conf.json").write_text('{\n\t"version": "0.1.0"\n}\n')
        (self.root / "src-tauri/Cargo.toml").write_text(
            '[package]\nname = "demo"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n'
        )
        (self.root / "src-tauri/Cargo.lock").write_text(
            '[[package]]\nname = "demo"\nversion = "0.1.0"\n\n[[package]]\nname = "other"\nversion = "0.1.0"\n'
        )

    def run_script(self, *args):
        return subprocess.run(
            ["bash", str(self.root / "scripts/bump-version.sh"), *args], capture_output=True, text=True
        )

    def test_bump_sets_every_copy_and_only_the_apps_lock_entry(self):
        result = self.run_script("2.3.4")
        self.assertEqual(result.returncode, 0, result.stderr)
        for path in ("package.json", "src-tauri/tauri.conf.json"):
            self.assertEqual(json.loads((self.root / path).read_text())["version"], "2.3.4")
        self.assertIn('version = "2.3.4"', (self.root / "src-tauri/Cargo.toml").read_text())
        self.assertIn('serde = { version = "1" }', (self.root / "src-tauri/Cargo.toml").read_text())
        lock = (self.root / "src-tauri/Cargo.lock").read_text()
        self.assertIn('name = "demo"\nversion = "2.3.4"', lock)
        self.assertIn('name = "other"\nversion = "0.1.0"', lock)

    def test_check_names_the_file_that_differs(self):
        (self.root / "src-tauri/tauri.conf.json").write_text('{"version": "0.2.0"}')
        result = self.run_script("--check")
        self.assertEqual(result.returncode, 1)
        self.assertIn("tauri.conf.json", result.stderr)

    def test_check_passes_when_consistent(self):
        self.assertEqual(self.run_script("--check").returncode, 0)

    def test_refuses_a_non_version(self):
        self.assertEqual(self.run_script("1.2.3;rm").returncode, 2)
