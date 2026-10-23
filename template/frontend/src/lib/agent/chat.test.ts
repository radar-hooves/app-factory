import { afterEach, describe, expect, it, vi } from 'vitest';

import { setViewAs } from '$lib/api';

import { chatTransport, type Persona } from './chat';

const persona = { id: 'guide', name: 'Ask Guide' } as Persona;

describe('the chat transport while an admin views as a colleague', () => {
	const sent = async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		vi.stubGlobal('fetch', fetch);
		const events = chatTransport(persona).ask({ question: 'hello', files: [] });
		for await (const _ of events) void _;
		const init = fetch.mock.calls.at(0)?.at(1) as RequestInit;
		return new Headers(init.headers).get('X-View-As');
	};

	afterEach(() => {
		setViewAs(null);
		vi.unstubAllGlobals();
	});

	it('sends X-View-As on the streamed ask', async () => {
		setViewAs(['reports', 'example']);
		expect(await sent()).toBe('reports|example');
	});

	it('sends none when nothing is narrowed', async () => {
		expect(await sent()).toBeNull();
	});
});
