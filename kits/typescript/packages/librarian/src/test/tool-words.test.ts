/**
 * A persona with tools of its own speaks about them in its own words.
 *
 * The package knows the household persona's tools; a host whose persona reads page images or
 * consults a memory store brings a `DescribeTool`, and its words reach the
 * row, the activity line and the list of what the answer read. The calls are
 * the real job stream's.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AgentTranscript from '$lib/components/agent-transcript/agent-transcript.svelte';
import { Session } from '$lib/session.svelte';
import { readFrom, segment, type ActivityGroup, type DescribeTool } from '$lib/transcript.svelte';
import { captured } from './fixtures/captured';

const describeTool: DescribeTool = (block) => {
	const input = JSON.parse(block.rawInput || '{}') as Record<string, unknown>;
	const slice = /page-(\d+)-(\d+)\.png$/.exec(String(input.file_path ?? ''));
	if (block.name === 'Read' && slice) {
		const part = slice[2] === '1' ? 'top slice' : 'bottom slice';
		return {
			verb: 'Read',
			object: `page ${slice[1]}, ${part}`,
			source: { id: `page-${slice[1]}-${slice[2]}`, title: `Page ${slice[1]}`, section: part }
		};
	}
	if (block.name === 'Bash') {
		return { verb: 'Added up', object: 'the line amounts' };
	}
	return undefined;
};

const session = new Session();
for (const event of captured('job-stream')) session.apply(event);
const [first, second] = session.turns;

describe('a host DescribeTool', () => {
	it('puts the persona’s own words on each step', () => {
		const [group] = segment(first.blocks, describeTool) as ActivityGroup[];
		expect(group.steps.flatMap((s) => (s.words ? [s.words.verb] : []))).toEqual(['Read', 'Read', 'Added up']);
	});

	it('lists what the calls read, once each, in the order read', () => {
		expect(readFrom(first.blocks, describeTool)).toEqual([
			{ n: 1, document_id: 'page-1-1', title: 'Page 1', section: 'top slice', derived: true },
			{ n: 2, document_id: 'page-1-2', title: 'Page 1', section: 'bottom slice', derived: true }
		]);
		expect(readFrom(second.blocks, describeTool)).toEqual([]);
	});

	it('leaves a tool it has no words for to the package', () => {
		const [group] = segment(first.blocks, () => undefined) as ActivityGroup[];
		expect(group.steps.flatMap((s) => (s.words ? [s.words.verb] : []))).toEqual(['Read', 'Read', 'Looked into it']);
	});

	it('reaches the rendered turn: the rows, and "Read from" with no trust mark', async () => {
		render(AgentTranscript, {
			props: {
				question: first.question,
				blocks: first.blocks,
				outcome: first.outcome,
				running: false,
				describeTool,
				copy: { sources: 'Read from' },
				oncite: () => {}
			}
		});
		expect(screen.getByText('page 1, top slice')).toBeInTheDocument();
		expect(screen.getByText('the line amounts')).toBeInTheDocument();
		expect(screen.getByText('Read from')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Page 1 · bottom slice/ })).toBeEnabled();
		expect(screen.queryByText(/verified/)).not.toBeInTheDocument();
	});
});
