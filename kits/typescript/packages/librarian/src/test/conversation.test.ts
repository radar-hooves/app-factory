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
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import type { AgentTranscriptProps } from '$lib/components/agent-transcript';
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

describe("Conversation in the host's own words", () => {
	const ANSWERED: Turn[] = [
		{
			id: '1',
			question: 'How much leave?',
			blocks: [{ kind: 'text', index: 0, text: 'Four weeks [1].' }],
			outcome: { turns: 1, durationMs: 1000 },
			citations: [{ n: 1, document_id: '7', title: 'The Manual' }]
		}
	];

	it("renders a host's own turn in place of the package's, handed every prop the package's took", () => {
		const seen: AgentTranscriptProps[] = [];
		const turn = createRawSnippet((props: () => AgentTranscriptProps) => {
			seen.push(props());
			return { render: () => `<p>Asked: ${props().question}</p>` };
		});
		const formatCost = (usd: number) => `about A$${usd}`;
		conversation({
			turns: [{ ...ANSWERED[0], depth: 'quick' }],
			turn,
			name: 'penny',
			oncite: () => undefined,
			formatCost
		});
		expect(screen.getByText('Asked: How much leave?')).toBeInTheDocument();
		// The package's card, signed with the persona, is gone.
		expect(screen.queryByText('Penny')).toBeNull();
		expect(seen[0]).toMatchObject({ question: 'How much leave?', name: 'Penny', running: false });
		expect(seen[0].citations?.[0]?.title).toBe('The Manual');
		expect(seen[0].oncite).toBeTypeOf('function');
		expect(seen[0].depth).toBe('quick');
		expect(seen[0].formatCost).toBe(formatCost);
	});

	it("folds a turn's depth and the host's own priced cost into the one footer line", () => {
		const turns: Turn[] = [
			{
				id: '1',
				question: 'Can a reservist claim recreation leave?',
				blocks: [{ kind: 'text', index: 0, text: 'Yes, on continuous full-time service.' }],
				outcome: { turns: 3, durationMs: 56_000, costUsd: 0.23 },
				depth: 'thorough'
			}
		];
		conversation({ turns, formatCost: (usd: number) => `about A$${(usd * 1.5).toFixed(2)}` });
		expect(screen.getByText('Thorough · 56 s · about A$0.35')).toBeInTheDocument();
	});

	it('shows depth and duration alone when the run cost nothing', () => {
		const turns: Turn[] = [
			{
				id: '1',
				question: 'q',
				blocks: [{ kind: 'text', index: 0, text: 'a' }],
				outcome: { turns: 1, durationMs: 4_000, costUsd: 0 },
				depth: 'quick'
			}
		];
		conversation({ turns, formatCost: (usd: number) => `about A$${usd}` });
		expect(screen.getByText('Quick · 4 s')).toBeInTheDocument();
	});

	it('shows what leads the conversation inside its scroll, under the opening', () => {
		const lead = createRawSnippet(() => ({ render: () => '<section>Lately</section>' }));
		conversation({ lead, examples: ['How much leave?'] });
		const log = screen.getByRole('log');
		expect(log).toContainElement(screen.getByText('Lately'));
		expect(
			screen.getByText('How much leave?').compareDocumentPosition(screen.getByText('Lately')) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});
});
