/**
 * One endpoint, two encodings. A `File` cannot cross a JSON body, so files
 * switch the ask to multipart — and the field names are the form convention,
 * not the JSON keys, because that is what the route reads.
 */
import { describe, it, expect, vi } from 'vitest';
import { ask } from '$lib/client';

function capture() {
	const calls: Array<[string, RequestInit]> = [];
	const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
		calls.push([url, init]);
		return { ok: false, body: null } as unknown as Response;
	});
	return { calls, fetch: fetchMock as unknown as typeof fetch };
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

	it('names Milton, not the transport, when the route refuses', async () => {
		const { fetch } = capture();
		const events = [];
		for await (const event of ask({ question: 'q', fetch })) events.push(event);
		expect(events).toEqual([{ type: 'library_error', error: "Milton can't be reached right now." }]);
	});
});
