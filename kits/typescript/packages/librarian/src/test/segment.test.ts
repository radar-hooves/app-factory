/**
 * Where the answer starts.
 *
 * Milton narrates between tool calls — "Let me also check…" — and the caller
 * stream gives that no `thinking` block to arrive in: it is a plain `text`
 * block, identical in every way to the answer except that a tool call comes
 * after it. Measured on production 11/09/2026, which is where every sentence
 * quoted here comes from. `segment()` is the only thing standing between that
 * and a reader taking the narration for the answer.
 */
import { describe, it, expect } from 'vitest';
import {
	segment,
	summariseActivity,
	type ActivityGroup,
	type Block,
	type Segment,
	type TextBlock
} from '$lib/transcript.svelte';

let next = 0;
const text = (body: string): Block => ({ kind: 'text', index: next++, text: body });
const tool = (name: string, input: Record<string, unknown>): Block => ({
	kind: 'tool',
	index: next++,
	name,
	rawInput: JSON.stringify(input)
});
const thinking = (body: string): Block => ({ kind: 'thinking', index: next++, text: body });

const groups = (out: Segment[]) => out.filter((s): s is ActivityGroup => s.kind === 'activity');
const prose = (out: Segment[]) => out.filter((s): s is TextBlock => s.kind === 'text');
const stepText = (group: ActivityGroup) =>
	group.steps.map((s) => (s.block.kind === 'text' ? s.block.text : `[${s.block.kind}]`));

const NARRATION =
	"Let me also check if there's any provision for cashing out while still serving, to be thorough.";
const ANSWER = 'Recreation leave accrues at **20 days a year** for a permanent member [1].';

describe('narration, then a tool, then the answer', () => {
	const blocks = [
		tool('Grep', { pattern: 'recreation leave' }),
		text(NARRATION),
		tool('Read', { file_path: '/data/staged/pacman-division-2/page-014.md' }),
		text(ANSWER)
	];
	const out = segment(blocks);

	it('leaves the narration out of the answer entirely', () => {
		expect(prose(out).map((s) => s.text)).toEqual([ANSWER]);
	});

	it('keeps it, as a step inside the one activity group', () => {
		expect(groups(out)).toHaveLength(1);
		expect(stepText(groups(out)[0])).toEqual(['[tool]', NARRATION, '[tool]']);
	});

	it('does not let the narration break the activity into two groups', () => {
		// The whole point of the group is that a reader sees ONE line. A
		// narration block that ended the group would put a second "Looked into
		// it" line under the first every time Milton said anything.
		expect(out).toHaveLength(2);
		expect(out[0].kind).toBe('activity');
		expect(out[1].kind).toBe('text');
	});

	it('still counts only what Milton DID in the summary', () => {
		expect(summariseActivity(groups(out)[0])).toBe('1 search · 1 document read');
	});
});

describe('an answer with no narration in front of it', () => {
	it('is prose, whether or not anything was looked at first', () => {
		const withTools = segment([tool('Grep', { pattern: 'leave' }), text(ANSWER)]);
		expect(prose(withTools).map((s) => s.text)).toEqual([ANSWER]);
		expect(groups(withTools)).toHaveLength(1);

		const alone = segment([text(ANSWER)]);
		expect(alone).toHaveLength(1);
		expect(prose(alone).map((s) => s.text)).toEqual([ANSWER]);
	});

	it('keeps a whole run of trailing text blocks as the answer', () => {
		// An answer can arrive as more than one block. Only a tool call after a
		// block demotes it; another text block never does.
		const out = segment([tool('Grep', { pattern: 'leave' }), text('First half.'), text(ANSWER)]);
		expect(prose(out).map((s) => s.text)).toEqual(['First half.', ANSWER]);
	});
});

describe('a turn that narrated and then failed', () => {
	// The run died after the last tool call, so nothing after it ever arrived.
	const out = segment([
		tool('Grep', { pattern: 'cash out recreation leave' }),
		text(NARRATION),
		tool('Read', { file_path: '/data/staged/pacman-division-2/page-020.md' })
	]);

	it('offers no answer at all, rather than the narration as one', () => {
		expect(prose(out)).toHaveLength(0);
		expect(out).toHaveLength(1);
		expect(out[0].kind).toBe('activity');
	});

	it('still holds what he said, behind the fold', () => {
		expect(stepText(groups(out)[0])).toContain(NARRATION);
	});
});

describe('an answer that carries a heading of its own', () => {
	it('is prose from its first heading to its last line', () => {
		const body = [
			'## What accrues, and when',
			'',
			'A permanent member accrues 20 days a year [1].',
			'',
			'## Carrying leave over',
			'',
			'A balance above the cap is not lost automatically [2].'
		].join('\n');
		const out = segment([
			tool('Grep', { pattern: 'recreation leave' }),
			text(NARRATION),
			tool('Read', { file_path: '/data/staged/pacman-division-2/page-014.md' }),
			text(body)
		]);

		// Nothing keys on the prose itself — not a heading, not a citation
		// marker, not a length. Position is the only signal the stream gives,
		// and a rule read off the words would be unexplainable the first time
		// it misfired on an answer that opens with a heading.
		expect(prose(out).map((s) => s.text)).toEqual([body]);
		expect(prose(out)[0].text).toContain('## Carrying leave over');
	});
});

describe('while the turn is still streaming', () => {
	it('renders a text block as the answer, then re-homes it when a tool follows', () => {
		const search = tool('Grep', { pattern: 'recreation leave' });
		const said = text(NARRATION);

		// Frame one: the narration is the last thing in the turn, so as far as
		// anything can know it IS the answer, and it renders as prose.
		const mid = segment([search, said]);
		expect(prose(mid).map((s) => s.text)).toEqual([NARRATION]);

		// Frame two: a tool call arrives after it and it is narration after all.
		const after = segment([search, said, tool('Read', { file_path: '/a/b/page-001.md' })]);
		expect(prose(after)).toHaveLength(0);
		expect(stepText(groups(after)[0])).toContain(NARRATION);

		// And the group keeps the key it already had, so re-homing does not
		// re-mount the disclosure the reader may have opened.
		expect(groups(after)[0].index).toBe(groups(mid)[0].index);
	});
});

describe('what never reaches a row', () => {
	it('drops an empty narration block, as it does an empty thinking one', () => {
		const out = segment([
			tool('Grep', { pattern: 'leave' }),
			text('   '),
			thinking(''),
			tool('Read', { file_path: '/a/b/page-001.md' }),
			text(ANSWER)
		]);
		expect(groups(out)[0].steps).toHaveLength(2);
		expect(stepText(groups(out)[0])).toEqual(['[tool]', '[tool]']);
	});

	it('keeps two narration sentences as two rows, never one with a count', () => {
		const out = segment([
			text('First, the accrual rate.'),
			text('Then the carry-over cap.'),
			tool('Grep', { pattern: 'leave' })
		]);
		expect(groups(out)[0].steps.map((s) => s.repeats)).toEqual([1, 1, 1]);
	});
});
