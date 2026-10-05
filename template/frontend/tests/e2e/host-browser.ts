import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Chromium this suite launches on NixOS, or undefined for Playwright's own,
 * as on CI and macOS. `playwright.config.ts` gives it to every spec; a
 * precondition in `app-web-server.ts` that launches a browser of its own passes
 * it too: `chromium.launch({ executablePath: hostChromium() })`.
 *
 * NixOS runs no downloaded browser: one `playwright install` put in the cache
 * is found, launched, and dies on a missing shared library. The host declares
 * nixpkgs' patched browsers as PLAYWRIGHT_BROWSERS_PATH, at nixpkgs' Playwright
 * revision rather than this app's, and its headless shell runs instead. A pixel
 * baseline stays CI's: it is a different Chromium.
 */
export function hostChromium(): string | undefined {
	if (!existsSync('/etc/NIXOS')) return undefined;
	const dir = browsersPath();
	const build = dir && readdirSync(dir).find((name) => name.startsWith('chromium_headless_shell-'));
	const shell =
		dir && build
			? ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']
					.map((binary) => join(dir, build, binary))
					.find((path) => existsSync(path))
			: undefined;
	// Said, not thrown: a config that throws stops `--list` and codegen too.
	if (!shell) {
		console.warn(
			'NixOS runs no downloaded browser, and this host declares none: set ' +
				'environment.variables.PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}".'
		);
	}
	return shell;
}

// The process's own variable, else NixOS's declaration of it. A shell reads
// /etc/set-environment once per process tree, so a process descended from one
// started before the variable was declared (an editor, an agent, a runner)
// never has it, though the host declares it.
function browsersPath(): string | undefined {
	const name = 'PLAYWRIGHT_BROWSERS_PATH';
	let dir = process.env[name];
	if (!dir) {
		try {
			dir = readFileSync('/etc/set-environment', 'utf8').match(
				new RegExp(`^export ${name}="([^"]+)"`, 'm')
			)?.[1];
		} catch {
			dir = undefined;
		}
	}
	return dir && existsSync(dir) ? dir : undefined;
}
