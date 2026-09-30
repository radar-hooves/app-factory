import { describe, expect, it } from 'vitest';

import { match } from './params/spa';

// Beside src/params/, not in it: SvelteKit reads every file there as a matcher
// and refuses a name with a dot in it.
describe("the catch-all's matcher", () => {
	it.each([
		'api/export/listens',
		'api/system/health',
		'mcp',
		'_app/immutable/entry/start.js',
		'openapi.json',
		'docs',
		'faro/collect',
		'outpost.goauthentik.io/start',
		'favicon.png',
		'reports/2026/summary.csv'
	])('leaves %s to a full page load', (path) => {
		expect(match(path)).toBe(false);
	});

	it.each(['no-route-serves-this', 'settings/unknown', 'api-docs', 'mcp-servers/list'])(
		'claims %s as a page the app does not have',
		(path) => {
			expect(match(path)).toBe(true);
		}
	);
});
