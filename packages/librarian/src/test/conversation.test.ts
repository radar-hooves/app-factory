/**
 * The whole reading surface takes the persona's name once and threads it
 * through every label that names Milton — the library's own console never
 * passes it and keeps rendering Milton unchanged.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import type { Turn } from '$lib/transcript.svelte';

describe('Conversation name', () => {
	it('defaults to Milton everywhere', () => {
		render(Conversation, { props: { turns: [], running: false } });
		expect(screen.getByRole('log', { name: 'Conversation with Milton' })).toBeInTheDocument();
		expect(screen.getByText('Ask Milton a question about the library.')).toBeInTheDocument();
	});

	it("takes the host's own persona name in the aria-label and the welcome", () => {
		render(Conversation, { props: { turns: [], running: false, name: 'Penny' } });
		expect(screen.getByRole('log', { name: 'Conversation with Penny' })).toBeInTheDocument();
		expect(screen.getByText('Ask Penny a question about the library.')).toBeInTheDocument();
	});

	it('names the persona in the unreachable alert, not just Milton', () => {
		const turns: Turn[] = [
			{
				id: '1',
				question: 'q',
				blocks: [],
				outcome: { isError: true, error: "Milton can't be reached right now." }
			}
		];
		render(Conversation, { props: { turns, running: false, name: 'Penny' } });
		expect(screen.getByText("Penny can't be reached right now.")).toBeInTheDocument();
	});

	it("a host's own copy override still wins over the name-composed default", () => {
		const turns: Turn[] = [
			{
				id: '1',
				question: 'q',
				blocks: [],
				outcome: { isError: true, error: "Milton can't be reached right now." }
			}
		];
		render(Conversation, {
			props: {
				turns,
				running: false,
				name: 'Penny',
				copy: { unreachable: 'The boardroom is offline.' }
			}
		});
		expect(screen.getByText('The boardroom is offline.')).toBeInTheDocument();
	});
});
