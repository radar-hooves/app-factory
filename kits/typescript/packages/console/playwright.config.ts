import { defineConfig, devices } from '@playwright/test';

// The console is a component lab, not a deployed app — no backend, no
// tenancy, no registry port. This drives it against its own dev server on
// its already-declared port (package.json), a narrower stanza than the
// stamped app's `playwright.config.ts.jinja` for that reason.
const CI = !!process.env.CI;
const PORT = 9176;

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: CI ? 90_000 : 30_000,
	expect: { timeout: CI ? 20_000 : 5_000 },
	retries: 0,
	reporter: CI ? [['list'], ['github']] : [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: CI ? 'retain-on-failure' : 'off'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: `pnpm run dev --port ${PORT}`,
		port: PORT,
		reuseExistingServer: !CI,
		timeout: 60_000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
