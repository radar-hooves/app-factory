/**
 * One endpoint, two encodings, and one promise: `ask()` never throws.
 *
 * The encodings are the old half — a `File` cannot cross a JSON body, so files
 * switch the ask to multipart, with the field names the route reads. The
 * promise is the half this file gained after a session expiry left
 * Pebblestone's console with Send disabled and nothing on screen: every way a
 * stream can fail to open or die half-way has to reach the host as an event
 * and a finished iteration, because the host's loop is what re-enables Send.
 */
import { describe, it, expect, vi } from 'vitest';
import { ask } from '$lib/client';

function capture() {
	const calls: Array<[string, RequestInit]> = [];
	const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
		calls.push([url, init]);
		return refusal();
	});
	return { calls, fetch: fetchMock as unknown as typeof fetch };
}

function refusal() {
	return { ok: false, body: null, headers: new Headers() } as unknown as Response;
}

/** A response streaming the frames given, as the wire carries them. */
function streaming(
	frames: string[],
	{ truncate = false, unterminated = false, contentType = 'text/event-stream' } = {}
) {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			frames.forEach((frame, index) => {
				const last = index === frames.length - 1;
				const separator = unterminated && last ? '' : '\n\n';
				controller.enqueue(encoder.encode(`data: ${frame}${separator}`));
			});
			if (truncate) controller.error(new TypeError('network error'));
			else controller.close();
		}
	});
	return {
		ok: true,
		body,
		headers: contentType ? new Headers({ 'content-type': contentType }) : new Headers()
	} as unknown as Response;
}

async function collect(generator: AsyncGenerator<unknown>) {
	const events = [];
	for await (const event of generator) events.push(event);
	return events;
}

async function drain(generator: AsyncGenerator<unknown>) {
	for await (const _ of generator) void _;
}

describe('ask()', () => {
	it('sends JSON when there is nothing attached', async () => {
		const { calls, fetch } = capture();
		await drain(
			ask({ question: 'How much leave?', collections: ['pacman'], endpoint: '/api/caller/ask', fetch })
		);

		const [url, init] = calls[0];
		expect(url).toBe('/api/caller/ask');
		expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
		expect(JSON.parse(init.body as string)).toEqual({
			question: 'How much leave?',
			resume: null,
			subtree: '',
			collections: ['pacman']
		});
	});

	it('sends multipart when files are attached', async () => {
		const { calls, fetch } = capture();
		const file = new File(['x'], 'posting-order.pdf', { type: 'application/pdf' });
		await drain(
			ask({
				question: 'Does this change my balance?',
				resume: 'session-1',
				collections: ['pacman', 'air6015'],
				files: [file],
				endpoint: '/api/caller/ask',
				fetch
			})
		);

		const [, init] = calls[0];
		expect(init.body).toBeInstanceOf(FormData);
		const form = init.body as FormData;
		expect(form.get('question')).toBe('Does this change my balance?');
		expect(form.get('resume')).toBe('session-1');
		expect(form.getAll('collections[]')).toEqual(['pacman', 'air6015']);
		expect((form.getAll('files[]')[0] as File).name).toBe('posting-order.pdf');
	});

	it('never sets Content-Type on a multipart body', async () => {
		// Setting it by hand omits the boundary the browser generates, and the
		// server then reads zero fields from a body that is on the wire perfectly.
		const { calls, fetch } = capture();
		await drain(
			ask({
				question: 'q',
				files: [new File(['x'], 'a.png', { type: 'image/png' })],
				fetch
			})
		);
		expect(calls[0][1].headers).toBeUndefined();
	});

	it('omits an absent resume rather than sending an empty field', async () => {
		const { calls, fetch } = capture();
		await drain(
			ask({ question: 'q', files: [new File(['x'], 'a.png', { type: 'image/png' })], fetch })
		);
		expect((calls[0][1].body as FormData).has('resume')).toBe(false);
	});

	it('reports a refused route as one wordless failure', async () => {
		// Wordless deliberately: the sentence a reader sees names a persona, and
		// this layer has no idea which one is speaking.
		const { fetch } = capture();
		expect(await collect(ask({ question: 'q', fetch }))).toEqual([{ type: 'library_error' }]);
	});

	it('reports a fetch that throws rather than throwing itself', async () => {
		// What an expired session looks like from here: the POST is redirected
		// cross-origin and the browser blocks it, so `fetch` rejects. A thrown
		// generator leaves the host's `for await` unfinished and its Send button
		// disabled for good.
		const fakeFetch = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch }))).toEqual([{ type: 'library_error' }]);
	});

	it('refuses a 200 that is not a stream at all', async () => {
		// The other expired-session shape: the redirect is followed to a login
		// page, which answers 200 with HTML. Read as a stream it yields no
		// frames at all and the turn waits for an answer that cannot come.
		const fakeFetch = vi.fn(async () => ({
			ok: true,
			body: new ReadableStream(),
			headers: new Headers({ 'content-type': 'text/html; charset=utf-8' })
		})) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch }))).toEqual([{ type: 'library_error' }]);
	});

	it('ends a stream that dies mid-answer as a failure, not a finished turn', async () => {
		const fakeFetch = vi.fn(async () =>
			streaming([JSON.stringify({ type: 'assistant' })], { truncate: true })
		) as unknown as typeof globalThis.fetch;
		const events = await collect(ask({ question: 'q', fetch: fakeFetch }));
		expect(events.at(-1)).toEqual({ type: 'library_error' });
	});

	it('ends a stream that simply stops the same way', async () => {
		// No terminal `result` frame and no error either: the connection was
		// closed under us. Silence renders as an answer still arriving.
		const fakeFetch = vi.fn(async () =>
			streaming([JSON.stringify({ type: 'assistant' })])
		) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch }))).toEqual([
			{ type: 'assistant' },
			{ type: 'library_error' }
		]);
	});

	it('says nothing when the reader stopped it themselves', async () => {
		const controller = new AbortController();
		controller.abort();
		const fakeFetch = vi.fn(async () => {
			throw new DOMException('aborted', 'AbortError');
		}) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch, signal: controller.signal }))).toEqual([]);
	});

	it('keeps a last frame the server sent without its blank line', async () => {
		// A stream that closes cleanly mid-separator still sent that frame, and
		// it is usually the terminal `result` carrying the duration and the
		// sources. Dropped, a finished answer wears an unreachable line.
		const fakeFetch = vi.fn(async () =>
			streaming([JSON.stringify({ type: 'result', is_error: false })], { unterminated: true })
		) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch }))).toEqual([
			{ type: 'result', is_error: false }
		]);
	});

	it('reads a stream whose route declared no content type at all', async () => {
		// A proxy that drops the header is still streaming; refusing it here
		// would be this layer breaking a working consumer over a header.
		const fakeFetch = vi.fn(async () =>
			streaming([JSON.stringify({ type: 'result', is_error: false })], { contentType: '' })
		) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch }))).toEqual([
			{ type: 'result', is_error: false }
		]);
	});

	it('leaves a completed run exactly as the CLI sent it', async () => {
		const fakeFetch = vi.fn(async () =>
			streaming([JSON.stringify({ type: 'result', is_error: false, duration_ms: 1200 })])
		) as unknown as typeof globalThis.fetch;
		expect(await collect(ask({ question: 'q', fetch: fakeFetch }))).toEqual([
			{ type: 'result', is_error: false, duration_ms: 1200 }
		]);
	});
});
