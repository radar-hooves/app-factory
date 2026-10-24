import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// The layout gate reuses the app's own E2E config, so it is signed in the way
// the E2E suite is: the same webServer boots `vite dev` with the dev identity.
// The E2E database guard (globalSetup) is not run: the gate writes nothing.
// LAYOUT_GATE_BASE_URL gates a server already running instead of booting one.
const external = process.env.LAYOUT_GATE_BASE_URL;
const baseURL = external ?? base.use?.baseURL;

export default defineConfig({
	...base,
	testDir: 'tests/layout',
	globalSetup: undefined,
	globalTeardown: base.globalTeardown,
	grep: undefined,
	retries: 0,
	workers: 1,
	timeout: 60 * 60_000,
	reporter: [['list']],
	use: { ...base.use, baseURL },
	webServer: external ? undefined : base.webServer
});
