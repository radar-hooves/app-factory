import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ActivityGroup from '$lib/components/activity-group/activity-group.svelte';
import { segment, type ActivityGroup as ActivityGroupType, type Block } from '$lib/transcript.svelte';

const blocks: Block[] = [
	{ kind: 'thinking', index: 0, text: 'Which clause covers this?' },
	{
		kind: 'tool',
		index: 1,
		name: 'mcp__library__search',
		rawInput: JSON.stringify({ query: 'recreation leave' }),
		result: '{"hits":[]}'
	},
	{
		kind: 'tool',
		index: 2,
		name: 'mcp__library__search',
		rawInput: JSON.stringify({ query: 'recreation leave' }),
		result: 'no access',
		isError: true
	}
];
const [group] = segment(blocks) as ActivityGroupType[];

const unfold = () => fireEvent.click(document.querySelector('.ds-lib-steps-head') as Element);
const rows = () =>
	[...document.querySelectorAll('.ds-lib-tool-row, .ds-lib-thinking-row')].map((r) =>
		r.textContent?.replace(/\s+/g, ' ').trim()
	);

describe('ActivityGroup', () => {
	it('folds the steps behind one line, and lists each as its own collapsed row, in order, when opened', async () => {
		render(ActivityGroup, { props: { group, live: false } });

		const head = screen.getByRole('button', { name: /3 steps$/ });
		expect(head).toHaveAttribute('aria-expanded', 'false');
		expect(rows()).toEqual([]);

		await fireEvent.click(head);
		expect(head).toHaveAttribute('aria-expanded', 'true');
		expect(rows()).toEqual([
			'Thought',
			'Searched the library for recreation leave 0 found',
			'Searched the library for recreation leave Failed'
		]);
		for (const row of document.querySelectorAll('.ds-lib-tool-row, .ds-lib-thinking-row'))
			expect(row).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText(/Working/)).not.toBeInTheDocument();
	});

	it('opens a step on what went in and what came back', async () => {
		render(ActivityGroup, { props: { group, live: false } });

		await unfold();
		await fireEvent.click(document.querySelectorAll('.ds-lib-tool-row')[0]);

		expect(screen.getByText('Input')).toBeInTheDocument();
		expect(document.body.textContent).toContain('"query": "recreation leave"');
		expect(screen.getByText('Result')).toBeInTheDocument();
		expect(document.body.textContent).toContain('{"hits":[]}');
	});

	it('says what is happening now while it runs, and Thought once the step is done', async () => {
		const { unmount } = render(ActivityGroup, {
			props: { group: segment([blocks[0]]).at(0) as ActivityGroupType, live: true }
		});
		expect(screen.getByRole('button', { name: 'Thinking…' })).toBeInTheDocument();
		await unfold();
		expect(screen.getAllByText('Thinking…')).toHaveLength(2);
		unmount();

		const unanswered: Block = {
			kind: 'tool',
			index: 3,
			name: 'mcp__supacrawl__supacrawl_search',
			rawInput: JSON.stringify({ query: 'pay' })
		};
		const running = segment([...blocks.slice(0, 2), unanswered]).at(0) as ActivityGroupType;
		render(ActivityGroup, { props: { group: running, live: true } });
		expect(screen.getByRole('button', { name: 'Searching the web…' })).toBeInTheDocument();
	});
});
