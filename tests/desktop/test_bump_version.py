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

    def git(self, *args):
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def commit_all(self, tag=None):
        self.git("init", "-q")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        self.git("add", "-A")
        self.git("commit", "-qm", "init")
        if tag:
            self.git("tag", tag)

    def test_refuses_a_version_not_above_the_in_tree_one(self):
        # The June 2026 case: untagged commits ran ahead, then the number was reset.
        for version in ("0.1.0", "0.0.9"):
            result = self.run_script(version)
            self.assertEqual(result.returncode, 2, version)
            self.assertIn("in-tree version", result.stderr)

    def test_refuses_a_version_not_above_the_last_tag(self):
        self.commit_all(tag="v0.5.0")
        result = self.run_script("0.2.0")
        self.assertEqual(result.returncode, 2)
        self.assertIn("last tag v0.5.0", result.stderr)

    def test_compares_numerically_not_lexically(self):
        self.commit_all(tag="v0.1.9")
        self.assertEqual(self.run_script("0.1.10").returncode, 0)

    def test_refuses_a_stray_declaration_of_the_outgoing_version(self):
        for name, text in (("meta.json", '{"version": "0.1.0"}\n'), ("extra.nix", '  version = "0.1.0";\n')):
            (self.root / name).write_text(text)
            self.commit_all()
            result = self.run_script("0.2.0")
            self.assertEqual(result.returncode, 2, name)
            self.assertIn(name, result.stderr)
            self.git("rm", "-qf", name)
            self.git("commit", "-qm", "rm")

    def test_allows_changelog_lockfiles_prose_and_other_versions(self):
        (self.root / "CHANGELOG.md").write_text('version = "0.1.0"\n')
        (self.root / "pnpm-lock.yaml").write_text('version: "0.1.0"\n')
        (self.root / "notes.md").write_text("It shipped 0.1.0 once.\n")
        (self.root / "dep.nix").write_text('  version = "1.13.2";\n')
        self.commit_all(tag="v0.1.0")
        self.assertEqual(self.run_script("0.2.0").returncode, 0)


KIT = Path(__file__).resolve().parents[2] / "skeletons/desktop/scripts/update-kit-hash.sh"
FLAKE = Path(__file__).resolve().parents[2] / "skeletons/desktop/flake.nix.jinja"
REV = "a" * 40


class UpdateKitHashTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "src-tauri").mkdir()
        (self.root / "bin").mkdir()
        shutil.copy(KIT, self.root / "scripts/update-kit-hash.sh")
        # The stamped flake's own kitHash line, at the indentation the skeleton gives it.
        line = next(l for l in FLAKE.read_text().splitlines() if l.strip().startswith("kitHash = "))
        self.indent = line[: len(line) - len(line.lstrip())]
        self.assertGreater(len(self.indent), 2)
        self.flake = self.root / "flake.nix"
        self.flake.write_text(f'{{\n  let\n{line}\n  in 1;\n}}\n')
        (self.root / "src-tauri/Cargo.lock").write_text(
            f'[[package]]\nname = "x"\nsource = "git+https://github.com/radar-hooves/app-factory?rev={REV}#{REV}"\n'
        )
        nix = self.root / "bin/nix"
        nix.write_text('#!/bin/sh\necho \'{"hash": "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="}\'\n')
        nix.chmod(0o755)

    def run_script(self, *args):
        env = {"PATH": f"{self.root / 'bin'}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"}
        return subprocess.run(
            ["bash", str(self.root / "scripts/update-kit-hash.sh"), *args], capture_output=True, text=True, env=env
        )

    def test_check_sees_a_stale_hash_in_a_stamped_flake(self):
        result = self.run_script("--check")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("stale", result.stdout)

    def test_rewrite_keeps_the_indentation(self):
        self.assertEqual(self.run_script().returncode, 0)
        self.assertIn(f'{self.indent}kitHash = "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";', self.flake.read_text())
        self.assertEqual(self.run_script("--check").returncode, 0)
