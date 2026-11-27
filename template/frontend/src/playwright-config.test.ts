import { describe, expect, it, vi } from 'vitest';

describe('Playwright web servers', () => {
	it('keeps the frontend server by default and appends app servers', async () => {
		const { default: config } = await import('../playwright.config');
		expect(config.webServer).toHaveLength(1);
		const frontend = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
		expect(frontend).toMatchObject({ port: 5228, reuseExistingServer: false, timeout: 60_000 });

		vi.resetModules();
		vi.doMock('../tests/e2e/additional-web-servers', () => ({
			additionalWebServers: [{ command: 'fake-upstream', port: 9999 }]
		}));
		const { default: extended } = await import('../playwright.config');
		expect(extended.webServer).toEqual([frontend, { command: 'fake-upstream', port: 9999 }]);
		vi.doUnmock('../tests/e2e/additional-web-servers');
	});
});
