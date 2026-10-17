import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The element's fetch (`index.ts`): a signed-out answer makes the page's one
 * sign-in hop, never a second. Each test takes a fresh module, because the hop
 * in progress is held at module scope for every element on the page.
 */
const PAGE = 'https://placer.example.org/study?unit=4';
const assign = vi.fn();

function answer(status: number, body = '{}', type = 'application/json') {
	return vi
		.fn()
		.mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }));
}

async function runtime() {
	vi.resetModules();
	return import('./index');
}

describe('request', () => {
	beforeEach(() => {
		sessionStorage.clear();
		assign.mockReset();
		vi.stubGlobal('location', { href: PAGE, assign });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reads JSON as the viewer, with their credentials', async () => {
		const fetch = answer(200, '{"rows":2}');
		vi.stubGlobal('fetch', fetch);
		const { request } = await runtime();
		expect(await request('/api/catalogue')).toEqual({ ok: true, data: { rows: 2 } });
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
		expect(assign).not.toHaveBeenCalled();
	});

	it.each([
		['a 401', answer(401)],
		[
			'a throw (the sign-in redirect, which carries no CORS headers)',
			vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
		],
		['a page that is not JSON (the sign-in page itself)', answer(200, '<html>', 'text/html')]
	])('makes the sign-in hop once on %s, and comes back to this page', async (_, fetch) => {
		vi.stubGlobal('fetch', fetch);
		const { request, origin, SIGN_IN_PATH } = await runtime();
		expect(await request('/api/catalogue')).toEqual({ ok: false, kind: 'signing-in' });
		expect(assign).toHaveBeenCalledExactlyOnceWith(
			`${origin}${SIGN_IN_PATH}?return=${encodeURIComponent(PAGE)}`
		);
		// Every other element on the page waits for the same hop.
		expect(await request('/api/other')).toEqual({ ok: false, kind: 'signing-in' });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(assign).toHaveBeenCalledTimes(1);
	});

	it('takes signed out again straight after a hop as final, so it never loops', async () => {
		vi.stubGlobal('fetch', answer(401));
		const first = await runtime();
		await first.request('/api/catalogue');
		// The page came back from the hop: a fresh load, the same tab.
		const back = await runtime();
		expect(await back.request('/api/catalogue')).toEqual({ ok: false, kind: 'signed-out' });
		expect(assign).toHaveBeenCalledTimes(1);
	});

	it.each([
		[403, { ok: false, kind: 'refused' }],
		[404, { ok: false, kind: 'not-found' }],
		[500, { ok: false, kind: 'error', status: 500 }]
	])('reads a %i as what it is, never as a missing session', async (status, expected) => {
		vi.stubGlobal('fetch', answer(status));
		const { request } = await runtime();
		expect(await request('/api/catalogue')).toEqual(expected);
		expect(assign).not.toHaveBeenCalled();
	});
});
