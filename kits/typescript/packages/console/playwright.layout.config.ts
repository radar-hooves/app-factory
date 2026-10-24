import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

// Proves the template's own layout gate against the console, the design
// system's SvelteKit app (no auth). LAYOUT_GATE_BASE_URL gates a running server.
const here = dirname(fileURLToPath(import.meta.url));
const external = process.env.LAYOUT_GATE_BASE_URL;

// NixOS runs no downloaded browser: use the headless shell its declared
// PLAYWRIGHT_BROWSERS_PATH holds (as the template's tests/e2e/host-browser.ts does).
function hostChromium(): string | undefined {
	if (!existsSync('/etc/NIXOS')) return undefined;
	let dir = process.env.PLAYWRIGHT_BROWSERS_PATH;
	if (!dir) {
		try {
			dir = readFileSync('/etc/set-environment', 'utf8').match(
				/^export PLAYWRIGHT_BROWSERS_PATH="([^"]+)"/m
			)?.[1];
		} catch {
			return undefined;
		}
	}
	if (!dir || !existsSync(dir)) return undefined;
	const build = readdirSync(dir).find((n) => n.startsWith('chromium_headless_shell-'));
	return build
		? ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']
				.map((binary) => join(dir, build, binary))
				.find((path) => existsSync(path))
		: undefined;
}
const HOST_CHROMIUM = hostChromium();

export default defineConfig({
	testDir: resolve(here, '../../../../template/frontend/tests/layout'),
	outputDir: resolve(here, 'test-results'),
	retries: 0,
	workers: 1,
	timeout: 60 * 60_000,
	reporter: [['list']],
	use: { baseURL: external ?? 'http://localhost:9176' },
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				...(HOST_CHROMIUM && { launchOptions: { executablePath: HOST_CHROMIUM } })
			}
		}
	],
	webServer: external
		? undefined
		: { command: 'pnpm dev', port: 9176, reuseExistingServer: true }
});
