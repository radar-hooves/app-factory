/**
 * The library's two trailing frames put their payload on the same key and
 * mean two different things by it, so the fold's job is to keep only what its
 * own shape admits.
 */
import { describe, it, expect } from 'vitest';
import { Transcript } from '$lib/transcript.svelte';
import type { AgentEvent } from '$lib/client';

const event = (type: string, items: unknown): AgentEvent =>
	({ type, items }) as unknown as AgentEvent;

describe('the suggestions frame', () => {
	it('lands the follow-ups the librarian named', () => {
		const transcript = new Transcript();
		transcript.apply(event('suggestions', ['What debits leave?', 'Can I carry it over?']));
		expect(transcript.suggestions).toEqual(['What debits leave?', 'Can I carry it over?']);
	});

	it('keeps only what a reader could put in the composer', () => {
		const transcript = new Transcript();
		transcript.apply(event('suggestions', ['A real one', '   ', 42, null, { q: 'no' }]));
		expect(transcript.suggestions).toEqual(['A real one']);
	});

	it('is empty on a frame that named none', () => {
		const transcript = new Transcript();
		transcript.apply(event('suggestions', undefined));
		expect(transcript.suggestions).toEqual([]);
	});

	it('goes with the turn it belonged to', () => {
		const transcript = new Transcript();
		transcript.apply(event('suggestions', ['What debits leave?']));
		transcript.reset();
		expect(transcript.suggestions).toEqual([]);
	});
});

describe('the citations frame', () => {
	it('carries the currency the catalogue holds for each source', () => {
		const transcript = new Transcript();
		transcript.apply(
			event('citations', [
				{ n: 1, document_id: '412', title: 'PACMAN Division 2', verified_at: '2026-06-23' },
				{ n: 2, document_id: '9', title: 'Determination 2 of 2017', verified_at: null }
			])
		);
		expect(transcript.citations.map((c) => c.verified_at)).toEqual(['2026-06-23', null]);
	});

	it('drops anything that is not a citation', () => {
		// Both frames key their payload `items`; a strings-shaped citations
		// frame is the library having changed under us, and rendering it would
		// be worse than rendering nothing.
		const transcript = new Transcript();
		transcript.apply(event('citations', ['what next?']));
		expect(transcript.citations).toEqual([]);
	});
});
