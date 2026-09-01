import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from './client';

/**
 * The middleware stack's failure paths, driven through the real client rather
 * than by calling a middleware directly — the wiring is the part that goes
 * wrong. openapi-fetch runs `onError` in REVERSE registration order and stops
 * at the first hook returning a Response, so which hook actually clears the
 * timeout depends on the order in client.ts and cannot be read off any one
 * middleware in isolation.
 *
 * `fetch` is supplied per request (openapi-fetch's own option) instead of
 * stubbing the global: the client captures `globalThis.fetch` when it is
 * constructed at module load, so a global stubbed afterwards would never be
 * reached and the test would pass for the wrong reason.
 *
 * `baseUrl` is supplied for a duller reason — jsdom implements no `Request`, so
 * the timeout middleware's `new Request(...)` is undici's, which rejects the
 * relative URL the app's own empty baseUrl produces in the browser.
 */
const BASE_URL = 'http://localhost';

const rejectsWith = (error: unknown) => vi.fn().mockRejectedValue(error);

describe('the API client middleware stack', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('leaves no pending timer when fetch rejects with a network failure', async () => {
		const { error } = await api.GET('/api/users/me', {
			baseUrl: BASE_URL,
			fetch: rejectsWith(new TypeError('Failed to fetch'))
		});

		expect(error).toBeDefined();
		// The 30-second abort timer is the only timer this path starts. Still
		// pending here means it holds the process open and fires against a request
		// that resolved long ago — once per failed call, unbounded.
		expect(vi.getTimerCount()).toBe(0);
	});

	it('leaves no pending timer when the request is aborted', async () => {
		const abort = new DOMException('The operation was aborted.', 'AbortError');

		const { error } = await api.GET('/api/users/me', {
			baseUrl: BASE_URL,
			fetch: rejectsWith(abort)
		});

		expect(error).toBeDefined();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('leaves no pending timer on the ordinary success path', async () => {
		const ok = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 1 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		await api.GET('/api/users/me', { baseUrl: BASE_URL, fetch: ok });

		expect(vi.getTimerCount()).toBe(0);
	});

	it('normalises a network failure into the backend’s own error envelope', async () => {
		const { error } = await api.GET('/api/users/me', {
			baseUrl: BASE_URL,
			fetch: rejectsWith(new TypeError('Failed to fetch'))
		});

		// Deliberately the SAME { error, message } shape exceptions.py returns, so
		// a call site cannot tell an unreachable API from a real 503 and no call
		// site needs a second branch for it.
		expect(error).toEqual({ error: 'network_error', message: 'Could not reach the API.' });
	});

	it('normalises a timeout abort into the same envelope, with its own code', async () => {
		const abort = new DOMException('The operation was aborted.', 'AbortError');

		const { error } = await api.GET('/api/users/me', {
			baseUrl: BASE_URL,
			fetch: rejectsWith(abort)
		});

		expect(error).toEqual({ error: 'timeout', message: 'The request timed out.' });
	});
});
