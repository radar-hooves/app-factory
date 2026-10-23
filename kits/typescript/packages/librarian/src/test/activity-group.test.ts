import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ActivityGroup from '$lib/components/activity-group/activity-group.svelte';
import {
	segment,
	type ActivityGroup as ActivityGroupType,
	type Block
} from '$lib/transcript.svelte';

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
/** Each row's words, without the glyph a live one turns (it is hidden from a reader). */
const rows = () =>
	[...document.querySelectorAll('.ds-lib-tool-row, .ds-lib-thinking-row')].map((r) => {
		const words = r.cloneNode(true) as Element;
		for (const glyph of words.querySelectorAll('.ds-lib-spinner')) glyph.remove();
		return words.textContent?.replace(/\s+/g, ' ').trim();
	});

describe('ActivityGroup', () => {
	it('settled, folds the steps behind one line, and lists each as its own collapsed row, in order, when opened', async () => {
		render(ActivityGroup, { props: { group, live: false } });

		const head = screen.getByRole('button', { name: /3 steps$/ });
		expect(head).toHaveAttribute('aria-expanded', 'false');
		expect(rows()).toEqual([]);

		await fireEvent.click(head);
		expect(head).toHaveAttribute('aria-expanded', 'true');
		expect(rows()).toEqual([
			'Thought',
			'Searched the library for recreation leave 0 passages',
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

	it('while the turn runs, shows each step as its own row as it starts, the one under way in the present', () => {
		const unanswered: Block = {
			kind: 'tool',
			index: 3,
			name: 'mcp__supacrawl__supacrawl_search',
			rawInput: JSON.stringify({ query: 'pay' })
		};
		const running = segment([...blocks.slice(0, 2), unanswered]).at(0) as ActivityGroupType;
		render(ActivityGroup, { props: { group: running, live: true } });

		// No fold to open: the rows are the turn's own lines.
		expect(document.querySelector('.ds-lib-steps-head')).toBeNull();
		expect(rows()).toEqual([
			'Thought',
			'Searched the library for recreation leave 0 passages',
			'Searching the web for pay'
		]);
		// The step under way turns its glyph in place of its icon.
		const live = document.querySelectorAll('.ds-lib-tool-row')[1];
		expect(live.querySelector('.ds-lib-spinner')).not.toBeNull();
		expect(
			document.querySelectorAll('.ds-lib-tool-row')[0].querySelector('.ds-lib-spinner')
		).toBeNull();
	});

	it('shows the working-out as it is written, and folds it once the turn settles', async () => {
		const thinking = segment([blocks[0]]).at(0) as ActivityGroupType;
		const { rerender } = render(ActivityGroup, { props: { group: thinking, live: true } });
		expect(screen.getByRole('button', { name: 'Thinking…' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(screen.getByText('Which clause covers this?')).toBeInTheDocument();

		await rerender({ group: thinking, live: false });
		expect(screen.queryByText('Which clause covers this?')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^Thought\s*· 1 step$/ })).toBeInTheDocument();
	});

	it('keeps the rows open while the answer streams beneath them, live or not', () => {
		render(ActivityGroup, { props: { group, live: false, running: true } });
		expect(document.querySelector('.ds-lib-steps-head')).toBeNull();
		expect(rows()).toHaveLength(3);
		expect(document.querySelector('.ds-lib-spinner')).toBeNull();
	});
});
