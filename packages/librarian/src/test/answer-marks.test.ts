/**
 * What a settled answer says about itself: where it came from, when that was
 * last confirmed, whether anything backed it at all, and what to ask next.
 *
 * Rendered rather than unit-tested, because every one of these is a
 * CONDITIONAL — the defect each guards against is a line appearing on a turn
 * that has no business carrying it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AgentTranscript from '$lib/components/agent-transcript/agent-transcript.svelte';
import type { Block, Outcome } from '$lib/transcript.svelte';
import type { Citation } from '$lib/citations';

const ANSWER: Block[] = [
	{ kind: 'text', index: 0, text: 'Recreation leave accrues at 20 days a year [1].' }
];

const DONE: Outcome = { turns: 1, durationMs: 4200, costUsd: 0.03 };

const SOURCE: Citation = {
	n: 1,
	document_id: '412',
	title: 'PACMAN Division 2',
	section: 'Part 5',
	verified_at: '2026-06-23'
};

function answer(props: Record<string, unknown> = {}) {
	return render(AgentTranscript, {
		props: {
			question: 'How much recreation leave do I get?',
			blocks: ANSWER,
			outcome: DONE,
			running: false,
			...props
		}
	});
}

describe('the trust mark on a source', () => {
	it('says when the document was last confirmed, in plain words', () => {
		answer({ citations: [SOURCE] });
		expect(screen.getByText(/verified 23 Jun 2026/)).toBeInTheDocument();
	});

	it('says a document nothing has confirmed is not verified', () => {
		answer({ citations: [{ ...SOURCE, verified_at: null }] });
		expect(screen.getByText(/not verified/)).toBeInTheDocument();
	});

	it('names no machinery a colleague has no model of', () => {
		answer({ citations: [{ ...SOURCE, verified_at: null }] });
		const article = screen.getByRole('article');
		expect(article.textContent).not.toMatch(/catalogue|index|database|upstream|recheck|stale/i);
	});
});

describe('an answer with nothing behind it', () => {
	it('says so once the turn has settled', () => {
		answer({ citations: [] });
		expect(screen.getByText(/without a source/)).toBeInTheDocument();
	});

	it('says nothing of the kind while the answer is still streaming', () => {
		answer({ citations: [], running: true, outcome: null });
		expect(screen.queryByText(/without a source/)).not.toBeInTheDocument();
	});

	it('says nothing of the kind on an answer that cited something', () => {
		answer({ citations: [SOURCE] });
		expect(screen.queryByText(/without a source/)).not.toBeInTheDocument();
	});

	it('says nothing of the kind on a turn read back out of history', () => {
		// History stores prose and no citations, so an answer that cited three
		// documents comes back looking exactly like one that cited none. The
		// outcome is what separates them: a stored turn has none.
		answer({ citations: [], outcome: null });
		expect(screen.queryByText(/without a source/)).not.toBeInTheDocument();
	});

	it('says nothing of the kind on a turn that failed', () => {
		answer({
			citations: [],
			outcome: { isError: true, unreachable: true }
		});
		expect(screen.queryByText(/without a source/)).not.toBeInTheDocument();
	});

	it('says nothing of the kind on a run that failed WITHOUT saying why', () => {
		// The shape Claude Code's own error_max_turns / error_during_execution
		// terminal frame has: `is_error` set and no message at all. Read as a
		// clean finish, it produced a claim about the shelf off a run that
		// never finished looking.
		answer({ citations: [], outcome: { turns: 8, durationMs: 60_000, isError: true } });
		expect(screen.queryByText(/without a source/)).not.toBeInTheDocument();
	});
});

describe('a run that ended in error', () => {
	it('says so even when the run itself said nothing', () => {
		answer({ citations: [], outcome: { turns: 8, durationMs: 60_000, isError: true } });
		expect(screen.getByRole('alert')).toHaveTextContent('Milton stopped before finishing this one.');
	});

	it('does not wear a duration as though it had finished', () => {
		answer({ citations: [], outcome: { turns: 8, durationMs: 60_000, isError: true } });
		expect(screen.queryByText('60.0s')).not.toBeInTheDocument();
	});

	it("keeps whatever the failure did say, in preference to the package's words", () => {
		answer({ citations: [], outcome: { isError: true, error: 'The room is closed for maintenance.' } });
		expect(screen.getByRole('alert')).toHaveTextContent('The room is closed for maintenance.');
	});

	it('says the persona cannot be reached when the stream never opened', () => {
		answer({ citations: [], outcome: { isError: true, unreachable: true }, name: 'penny' });
		expect(screen.getByRole('alert')).toHaveTextContent("Penny can't be reached right now.");
	});
});

describe('the follow-ups an answer offers', () => {
	const SUGGESTIONS = ['Can I carry leave over when I post?', 'What debits recreation leave?'];

	it('offers each as its own question', () => {
		answer({ citations: [SOURCE], suggestions: SUGGESTIONS, onsuggest: vi.fn() });
		for (const followUp of SUGGESTIONS) {
			expect(screen.getByRole('button', { name: followUp })).toBeInTheDocument();
		}
	});

	it('sends the question on click, and vanishes rather than offering a second', async () => {
		const onsuggest = vi.fn();
		answer({ citations: [SOURCE], suggestions: SUGGESTIONS, onsuggest });

		screen.getByRole('button', { name: SUGGESTIONS[0] }).click();
		await Promise.resolve();

		expect(onsuggest).toHaveBeenCalledExactlyOnceWith(SUGGESTIONS[0]);
		expect(screen.queryByRole('button', { name: SUGGESTIONS[1] })).not.toBeInTheDocument();
	});

	it('renders none at all where the host cannot ask one', () => {
		// Conversation withholds the handler from every turn but the last, so
		// scrolling back never offers a follow-up to an answer three turns ago.
		answer({ citations: [SOURCE], suggestions: SUGGESTIONS });
		expect(screen.queryByRole('button', { name: SUGGESTIONS[0] })).not.toBeInTheDocument();
	});
});
