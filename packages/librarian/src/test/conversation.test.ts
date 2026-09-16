/**
 * One name, every word.
 *
 * The whole reading surface takes the persona's name once and composes every
 * sentence it renders from it — the working line, the failure sentences, the
 * scope label, the opening line and the accessible name of the scroll region.
 * The defect this file exists for shipped for a fortnight: Pebblestone's Penny
 * introduced herself as Milton, because the package's strings named him.
 *
 * The library's own console still passes nothing and still reads as Milton,
 * which is the difference between a default and a hardcoding.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import type { Turn } from '$lib/transcript.svelte';

function conversation(props: Record<string, unknown> = {}) {
	return render(Conversation, { props: { turns: [], running: false, ...props } });
}

const UNREACHED: Turn[] = [
	{ id: '1', question: 'q', blocks: [], outcome: { isError: true, unreachable: true } }
];

describe('Conversation name', () => {
	it('defaults to Milton everywhere', () => {
		conversation();
		expect(screen.getByRole('log', { name: 'Conversation with Milton' })).toBeInTheDocument();
		expect(screen.getByText('Ask Milton a question.')).toBeInTheDocument();
	});

	it("takes the host's own persona name in the aria-label and the welcome", () => {
		conversation({ name: 'Penny' });
		expect(screen.getByRole('log', { name: 'Conversation with Penny' })).toBeInTheDocument();
		expect(screen.getByText('Ask Penny a question.')).toBeInTheDocument();
	});

	it('renders a route slug as a name a colleague recognises', () => {
		// The consuming app passes `page.params.persona`, which is `penny`.
		conversation({ name: 'penny' });
		expect(screen.getByRole('log', { name: 'Conversation with Penny' })).toBeInTheDocument();
		expect(screen.getByText('Ask Penny a question.')).toBeInTheDocument();
	});

	it('names the persona in the unreachable alert, not just Milton', () => {
		conversation({ turns: UNREACHED, name: 'penny' });
		expect(screen.getByText("Penny can't be reached right now.")).toBeInTheDocument();
	});

	it("a host's own copy override still wins over the name-composed default", () => {
		conversation({
			turns: UNREACHED,
			name: 'penny',
			copy: { unreachable: 'The boardroom is offline.' }
		});
		expect(screen.getByText('The boardroom is offline.')).toBeInTheDocument();
	});

	it('names the persona while a question is still being worked on', () => {
		const turns: Turn[] = [{ id: '1', question: 'q', blocks: [], outcome: null }];
		conversation({ turns, running: true, name: 'penny' });
		expect(screen.getByText('Penny is looking…')).toBeInTheDocument();
	});

	it('names the persona in the scope statement it renders for the host', () => {
		conversation({ name: 'penny', scope: 'Bills, quotes and the project register.' });
		expect(screen.getByRole('button', { name: /What Penny answers from/ })).toBeInTheDocument();
	});

	it('signs each answer with the persona, so a reader can tell who said it', () => {
		const turns: Turn[] = [
			{
				id: '1',
				question: 'q',
				blocks: [{ kind: 'text', index: 0, text: 'Forty days.' }],
				outcome: { turns: 1, durationMs: 1000 }
			}
		];
		conversation({ turns, name: 'penny' });
		expect(screen.getByText('Penny')).toBeInTheDocument();
	});
});

describe('Conversation timestamps', () => {
	it('stamps a turn it watched arrive, and leaves history alone', async () => {
		// A turn already on screen at mount came out of storage: stamping it
		// `Date.now()` would print this afternoon against last week's question.
		const first: Turn[] = [{ id: 'old', question: 'asked last week', blocks: [], outcome: null }];
		const view = conversation({ turns: first });
		expect(document.querySelector('time')).toBeNull();

		await view.rerender({
			turns: [...first, { id: 'new', question: 'asked just now', blocks: [], outcome: null }],
			running: false
		});
		expect(document.querySelectorAll('time').length).toBeGreaterThan(0);
	});

	it("prefers the host's own timestamp where it keeps one", () => {
		const at = Date.UTC(2026, 8, 16, 2, 14);
		const turns: Turn[] = [{ id: '1', question: 'q', blocks: [], outcome: null, at }];
		conversation({ turns });
		const stamped = document.querySelector('time');
		expect(stamped?.getAttribute('datetime')).toBe(new Date(at).toISOString());
	});
});
