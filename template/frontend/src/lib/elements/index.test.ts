import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The element's API client (`index.ts`): a signed-out answer makes the page's
 * one sign-in hop, never a second. Each test takes a fresh module, because the
 * hop in progress is held at module scope for every element on the page.
 * `baseUrl` and `fetch` go per request, as the console's client test does: the
 * bundle's own origin, which the client defaults to, is `null` under Vitest.
 */
const PAGE = 'https://placer.example.org/study?unit=4';
const SERVICE = { baseUrl: 'https://service.example.org' };
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

describe('the element API client', () => {
	beforeEach(() => {
		sessionStorage.clear();
		assign.mockReset();
		vi.stubGlobal('location', { href: PAGE, assign });
		return () => vi.unstubAllGlobals();
	});

	it('reads the app as the viewer, with their credentials', async () => {
		const fetch = answer(200, '{"status":"healthy"}');
		const { api } = await runtime();
		const { data } = await api.GET('/api/system/health', { ...SERVICE, fetch });
		expect(data).toMatchObject({ status: 'healthy' });
		expect(fetch.mock.calls[0]?.[0]).toMatchObject({ credentials: 'include' });
		expect(assign).not.toHaveBeenCalled();
	});

	it.each([
		['a 401', answer(401)],
		[
			'a throw (the sign-in redirect, which carries no CORS headers)',
			vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
		],
		['a sign-in page in the API’s place', answer(200, '<html>', 'text/html')]
	])('makes the sign-in hop once on %s, and comes back to this page', async (_, fetch) => {
		const { api, signingIn, signInUrl } = await runtime();
		const { response } = await api.GET('/api/system/health', { ...SERVICE, fetch });
		expect(response.status).toBe(401);
		expect(signingIn()).toBe(true);
		expect(assign).toHaveBeenCalledExactlyOnceWith(signInUrl());
		expect(signInUrl()).toContain(`/elements/session?return=${encodeURIComponent(PAGE)}`);
		// Every other element on the page waits for the same hop.
		const again = await api.GET('/api/system/health', { ...SERVICE, fetch });
		expect(again.response.status).toBe(401);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(assign).toHaveBeenCalledTimes(1);
	});

	it('takes signed out again straight after a hop as final, so it never loops', async () => {
		const fetch = answer(401);
		await (await runtime()).api.GET('/api/system/health', { ...SERVICE, fetch });
		// The page came back from the hop: a fresh load, the same tab.
		const back = await runtime();
		const { response } = await back.api.GET('/api/system/health', { ...SERVICE, fetch });
		expect(response.status).toBe(401);
		expect(back.signingIn()).toBe(false);
		expect(assign).toHaveBeenCalledTimes(1);
	});

	it.each([403, 404, 500])(
		'passes a %i through as itself, never a missing session',
		async (status) => {
			const { api, signingIn } = await runtime();
			const { response } = await api.GET('/api/system/health', {
				...SERVICE,
				fetch: answer(status)
			});
			expect(response.status).toBe(status);
			expect(signingIn()).toBe(false);
			expect(assign).not.toHaveBeenCalled();
		}
	);
});
