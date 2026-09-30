import { describe, expect, it } from 'vitest';

import { match, spaMatcher } from './params/spa';

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

describe("the catch-all's matcher, given the prefixes an app's app-proxy.ts declares", () => {
	// Keys as vite.config.ts passes them: bare, trailing-slashed and anchored.
	const declared = spaMatcher(['/v1/', '/status', '/admin/', '^/microwave/', '/1', '/client']);

	it.each(['v1/items', 'status', 'admin/users', 'microwave/login', '1/scrobble', 'client/ping'])(
		'leaves %s to a full page load',
		(path) => {
			expect(declared(path)).toBe(false);
		}
	);

	it.each(['v1-notes', 'statuses', 'settings/unknown'])('still claims %s', (path) => {
		expect(declared(path)).toBe(true);
	});
});
