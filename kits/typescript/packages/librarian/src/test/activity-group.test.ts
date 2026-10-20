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

describe('ActivityGroup', () => {
	it('lists every step as its own collapsed row, in order, with no grouped line', () => {
		render(ActivityGroup, { props: { group, live: false } });

		const rows = screen.getAllByRole('button');
		expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Thought',
			'Searched the library for recreation leave',
			'Searched the library for recreation leave Failed'
		]);
		for (const row of rows) expect(row).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText(/Working/)).not.toBeInTheDocument();
	});

	it('opens a step on what went in and what came back', async () => {
		render(ActivityGroup, { props: { group, live: false } });

		await fireEvent.click(screen.getAllByRole('button')[1]);

		expect(screen.getByText('Input')).toBeInTheDocument();
		expect(document.body.textContent).toContain('"query": "recreation leave"');
		expect(screen.getByText('Result')).toBeInTheDocument();
		expect(document.body.textContent).toContain('{"hits":[]}');
	});

	it('says Thinking… on the thinking block still being written, and Thought once it is not', () => {
		const { unmount } = render(ActivityGroup, {
			props: { group: segment([blocks[0]]).at(0) as ActivityGroupType, live: true }
		});
		expect(screen.getByText('Thinking…')).toBeInTheDocument();
		unmount();

		render(ActivityGroup, { props: { group, live: true } });
		expect(screen.getByText('Thought')).toBeInTheDocument();
	});
});
