/**
 * A run under a JSON schema hands in its answer by calling the CLI's own
 * `StructuredOutput` tool. That call is not a step of the work: the words
 * before it are the answer, and a run that said nothing and handed in its
 * answer has still settled. Every assertion runs over godswood's recording
 * of a real two-run session (`fixtures/captured.ts`).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AgentTranscript from '$lib/components/agent-transcript/agent-transcript.svelte';
import { Session } from '$lib/session.svelte';
import { segment, type TextBlock, type Turn } from '$lib/transcript.svelte';
import { captured } from './fixtures/captured';

const session = new Session();
for (const event of captured('schema-session')) session.apply(event);
const [read, asked] = session.turns;

const ANSWER = /^Yes, confirmed\. The three lines sum correctly/;

function turn(t: Turn) {
	return render(AgentTranscript, {
		props: {
			question: t.question,
			blocks: t.blocks,
			outcome: t.outcome,
			running: false,
			artefact: { title: 'What it read', summary: '3 lines · adds up to $7.47' },
			onopenartefact: () => {}
		}
	});
}

describe('a session under a JSON schema', () => {
	it('is two runs, each settled on a structured answer', () => {
		expect(session.turns).toHaveLength(2);
		expect(asked.question).toBe('Count the lines again: is the total the sum of all three?');
		for (const t of session.turns) {
			expect(t.outcome?.structuredOutput).toMatchObject({ data: { lines: expect.any(Array) } });
		}
	});

	it('keeps the words before the answer is handed in as the answer', () => {
		const prose = segment(asked.blocks).filter((s): s is TextBlock => s.kind === 'text');
		expect(prose.map((s) => s.text)).toEqual([expect.stringMatching(ANSWER)]);
		// Nothing else was done, so there is no activity line at all.
		expect(segment(asked.blocks).some((s) => s.kind === 'activity')).toBe(false);
	});

	it('counts the reading and not the handing-in', () => {
		const [group, ...rest] = segment(read.blocks);
		expect(rest).toEqual([]);
		expect(group.kind === 'activity' && group.steps.map((s) => s.block)).toEqual([
			expect.objectContaining({ kind: 'tool', name: 'Read' })
		]);
	});

	it('shows neither side the CLI nudging its own model', () => {
		const said = JSON.stringify(session.turns);
		expect(said).not.toContain('structured-output-enforce');
	});

	it('cards the artefact of a run that said nothing', () => {
		turn(read);
		expect(screen.getByRole('button', { name: /What it read/ })).toBeInTheDocument();
		expect(screen.queryByText('Looked into it')).not.toBeInTheDocument();
	});

	it('cards the artefact under the words of a run that said something', () => {
		turn(asked);
		expect(screen.getByText(/The three lines sum correctly/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /What it read/ })).toBeInTheDocument();
	});
});
