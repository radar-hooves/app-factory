import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[2] / "skeletons/desktop/scripts/cargo-codesign.sh"


class SigningRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "src-tauri").mkdir()
        shutil.copy(RUNNER, self.root / "scripts/cargo-codesign.sh")
        self.tools = self.root / "tools"
        self.tools.mkdir()
        self.binary = self.root / "custom target/profile/app"
        self.binary.parent.mkdir(parents=True)
        self.tool(self.binary, 'printf "app:%s\\n" "$*" >> "$CALLS"')
        self.calls = self.root / "calls"
        self.env = {
            **os.environ,
            "PATH": f"{self.tools}:{os.environ['PATH']}",
            "CALLS": str(self.calls),
            "BINARY": str(self.binary),
            "APPLE_SIGNING_IDENTITY": "A" * 40,
            "TAURI_CONFIG": "{}",
            "TAURI_ENV_DEBUG": "false",
            "FAKE_OS": "Darwin",
            "CARGO_STATUS": "0",
            "SIGN_STATUS": "0",
            "VERIFY_STATUS": "0",
            "NO_ARTIFACT": "0",
        }
        self.config("-")
        self.tool(self.tools / "uname", 'printf "%s\\n" "$FAKE_OS"')
        self.tool(
            self.tools / "cargo",
            'printf "cargo:%s\\n" "$*" >> "$CALLS"\n'
            '[[ "$CARGO_STATUS" == 0 ]] || exit "$CARGO_STATUS"\n'
            '[[ "$NO_ARTIFACT" == 0 ]] || exit 0\n'
            'jq -n --arg path "$BINARY" \'{reason: "compiler-artifact", executable: $path, '
            'target: {kind: ["bin"]}, profile: {test: false}}\'',
        )
        self.tool(
            self.tools / "codesign",
            'printf "codesign:%s\\n" "$*" >> "$CALLS"\n'
            'if [[ "$1" == --verify ]]; then exit "$VERIFY_STATUS"; fi\n'
            'exit "$SIGN_STATUS"',
        )

    def tool(self, path, body):
        path.write_text(f"#!/usr/bin/env bash\nset -euo pipefail\n{body}\n")
        path.chmod(0o755)

    def config(self, identity):
        (self.root / "src-tauri/tauri.conf.json").write_text(
            json.dumps({"identifier": "com.example.app", "bundle": {"macOS": {"signingIdentity": identity}}})
        )

    def run_runner(self, *args, **env):
        return subprocess.run(
            ["bash", str(self.root / "scripts/cargo-codesign.sh"), *args],
            cwd=self.root / "src-tauri",
            env={key: value for key, value in {**self.env, **env}.items() if value is not None},
            capture_output=True,
            text=True,
            check=False,
        )

    def trace(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_build_signs_actual_artifact_with_stable_identifier(self):
        result = self.run_runner("build", "--release", "--target", "aarch64-apple-darwin")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.trace()), 3)
        self.assertIn("--target aarch64-apple-darwin", self.trace()[0])
        self.assertIn(f"--sign {'A' * 40} --identifier com.example.app", self.trace()[1])
        self.assertTrue(self.trace()[1].endswith(str(self.binary)))
        self.assertTrue(self.trace()[2].startswith("codesign:--verify --strict"))

    def test_dev_executes_only_after_verification_without_second_cargo_call(self):
        result = self.run_runner("run", "--profile", "custom", "--", "two words", "--flag")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.trace()), 4)
        self.assertNotIn("two words", self.trace()[0])
        self.assertEqual(self.trace()[-1], "app:two words --flag")
        self.assertEqual(sum(line.startswith("cargo:") for line in self.trace()), 1)

    def test_invalid_environment_identity_fails_before_cargo(self):
        for identity in ("Local Development", "A" * 39, "", " "):
            with self.subTest(identity=identity):
                result = self.run_runner("build", APPLE_SIGNING_IDENTITY=identity)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("APPLE_SIGNING_IDENTITY must be", result.stderr)
                self.assertEqual(self.trace(), [])

    def test_configured_identity_is_refused_even_with_environment_identity(self):
        for identity in ("A" * 40, "Local Development", 42, False):
            with self.subTest(identity=identity):
                self.config(identity)
                self.assertNotEqual(self.run_runner("build").returncode, 0)
                self.assertEqual(self.trace(), [])

    def test_certificate_free_local_build_is_explicitly_adhoc(self):
        for identity in ("", "-", None):
            with self.subTest(identity=identity):
                self.calls.unlink(missing_ok=True)
                self.config(identity)
                result = self.run_runner("build", "--profile=dev", APPLE_SIGNING_IDENTITY=None)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("local ad-hoc signing", result.stderr)
                self.assertIn("--sign - --identifier com.example.app", self.trace()[1])
                self.assertEqual(len(self.trace()), 3)

    def test_certificate_free_release_and_custom_profiles_fail_before_cargo(self):
        for identity in ("-", None):
            for args in (("--release",), ("-r",), ("-vr",), ("--profile", "release"), ("--profile=custom",)):
                with self.subTest(identity=identity, args=args):
                    result = self.run_runner("build", *args, APPLE_SIGNING_IDENTITY=identity)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("Release builds require", result.stderr)
                    self.assertEqual(self.trace(), [])

    def test_local_package_argument_and_application_flags_are_not_release_flags(self):
        self.config("-")
        result = self.run_runner("run", "-pbragi", "--", "-r", APPLE_SIGNING_IDENTITY="-")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.trace()[-1], "app:-r")

    def test_release_bundle_preflight_refuses_adhoc_without_invoking_cargo(self):
        self.config("-")
        for debug in ("false", "", "0"):
            with self.subTest(debug=debug):
                result = self.run_runner("check-bundle", TAURI_ENV_DEBUG=debug, APPLE_SIGNING_IDENTITY=None)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Release builds require", result.stderr)
                self.assertEqual(self.trace(), [])

    def test_debug_bundle_preflight_allows_explicit_adhoc(self):
        self.config("-")
        result = self.run_runner("check-bundle", TAURI_ENV_DEBUG="true", APPLE_SIGNING_IDENTITY="-")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("local ad-hoc signing", result.stderr)
        self.assertEqual(self.trace(), [])

    def test_release_bundle_preflight_uses_environment_identity(self):
        result = self.run_runner("check-bundle", APPLE_SIGNING_IDENTITY="B" * 40)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.trace(), [])

    def test_effective_tauri_config_cannot_add_a_competing_identity(self):
        result = self.run_runner(
            "check-bundle",
            TAURI_CONFIG=json.dumps({"bundle": {"macOS": {"signingIdentity": "B" * 40}}}),
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not pin a certificate", result.stderr)
        self.assertEqual(self.trace(), [])

    def test_environment_identity_and_effective_identifier_are_shared(self):
        result = self.run_runner(
            "build",
            "--release",
            APPLE_SIGNING_IDENTITY="B" * 40,
            TAURI_CONFIG=json.dumps({"identifier": "com.example.override"}),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"--sign {'B' * 40} --identifier com.example.override", self.trace()[1])

    def test_malformed_config_reports_only_controlled_error(self):
        for override in ('{"private_note":"fixture-value",', "not-json-fixture-value"):
            with self.subTest(override=override):
                result = self.run_runner("build", TAURI_CONFIG=override)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stderr, "codesign: Invalid bundle.macOS.signingIdentity in tauri.conf.json.\n")
                self.assertEqual(self.trace(), [])

    def test_both_mac_targets_sign_cargo_artifacts_not_guessed_paths(self):
        for target in ("aarch64-apple-darwin", "x86_64-apple-darwin"):
            with self.subTest(target=target):
                self.calls.unlink(missing_ok=True)
                binary = self.root / f"target/{target}/release/app"
                binary.parent.mkdir(parents=True)
                self.tool(binary, "exit 0")
                result = self.run_runner("build", "--release", "--target", target, BINARY=str(binary))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(self.trace()[1].endswith(str(binary)))
                self.assertTrue(self.trace()[2].endswith(str(binary)))

    def test_bundle_preflight_refuses_invalid_declaration_in_debug_too(self):
        result = self.run_runner("check-bundle", TAURI_ENV_DEBUG="true", APPLE_SIGNING_IDENTITY="")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.trace(), [])

    def test_failed_cargo_never_signs(self):
        result = self.run_runner("build", CARGO_STATUS="7")
        self.assertEqual(result.returncode, 7)
        self.assertEqual(len(self.trace()), 1)

    def test_signing_failure_never_verifies_or_launches(self):
        result = self.run_runner("run", SIGN_STATUS="8")
        self.assertEqual(result.returncode, 8)
        self.assertEqual(len(self.trace()), 2)

    def test_verification_failure_never_launches(self):
        result = self.run_runner("run", VERIFY_STATUS="9")
        self.assertEqual(result.returncode, 9)
        self.assertEqual(len(self.trace()), 3)

    def test_missing_artifact_fails(self):
        self.assertNotEqual(self.run_runner("build", NO_ARTIFACT="1").returncode, 0)
        self.assertEqual(len(self.trace()), 1)

    def test_linux_is_exact_cargo_passthrough_without_signing_config(self):
        (self.root / "src-tauri/tauri.conf.json").unlink()
        result = self.run_runner("run", "--", "app arg", FAKE_OS="Linux", NO_ARTIFACT="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.trace(), ["cargo:run -- app arg"])

    def test_linux_bundle_preflight_is_noop_without_signing_config(self):
        (self.root / "src-tauri/tauri.conf.json").unlink()
        result = self.run_runner("check-bundle", FAKE_OS="Linux")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.trace(), [])

    def test_other_cargo_commands_pass_through(self):
        result = self.run_runner("check", NO_ARTIFACT="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.trace(), ["cargo:check"])


if __name__ == "__main__":
    unittest.main()
