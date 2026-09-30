/**
 * A session somebody else started, read as a conversation.
 *
 * Every assertion here runs over a stream captured from the real CLI — the
 * shapes that matter (a replayed prompt, whole messages with no deltas, one
 * `result` per run) were measured, not modelled.
 */
import { describe, it, expect } from 'vitest';
import { Session } from '$lib/session.svelte';
import { segment, type TextBlock, type ToolBlock } from '$lib/transcript.svelte';
import { captured } from './fixtures/captured';

const STREAM = captured('job-stream');

function folded(events = STREAM) {
	const session = new Session();
	for (const event of events) session.apply(event);
	return session;
}

describe('Session', () => {
	it('opens a turn for the prompt and for every message after it, in order', () => {
		const { turns } = folded();
		expect(turns.map((t) => t.question)).toEqual([
			expect.stringMatching(/^File this document\./),
			'Which line is the largest, and why does that one stand out? One sentence.',
			'Look at the bottom slice again and tell me how many items it says were bought. One sentence.'
		]);
	});

	it('settles each run on its own result', () => {
		const { turns, working } = folded();
		expect(turns.map((t) => t.outcome?.turns)).toEqual([4, 1, 1]);
		expect(turns.every((t) => t.outcome?.isError === false)).toBe(true);
		expect(working).toBe(false);
	});

	it('is working while the last run has not settled', () => {
		const firstResult = STREAM.findIndex((e) => e.type === 'result');
		const session = folded(STREAM.slice(0, firstResult));
		expect(session.turns).toHaveLength(1);
		expect(session.working).toBe(true);
	});

	it('builds each turn from whole messages when the stream carries no deltas', () => {
		const [first] = folded().turns;
		const tools = first.blocks.filter((b): b is ToolBlock => b.kind === 'tool');
		expect(tools.map((t) => t.name)).toEqual(['Read', 'Read', 'Bash']);
		expect(tools.every((t) => t.result !== undefined)).toBe(true);

		// The sentence before the first call is narration; the answer is the run's
		// own `result`, word for word.
		const answer = segment(first.blocks).filter((s): s is TextBlock => s.kind === 'text');
		const result = STREAM.find((e) => e.type === 'result');
		expect(answer.map((s) => s.text).join('\n\n')).toBe(result?.result);
	});

	it('stamps a turn with when the CLI took its message', () => {
		const [first] = folded().turns;
		const replay = STREAM.find((e) => e.isReplay);
		expect(first.at).toBe(Date.parse(replay?.timestamp ?? ''));
	});

	it('folds nothing twice when the watch is opened again', () => {
		// A watch route replays from the first event; a host that re-opens it
		// after sending a message applies the whole stream again.
		const session = folded();
		const before = JSON.stringify(session.turns);
		for (const event of STREAM) session.apply(event);
		expect(JSON.stringify(session.turns)).toBe(before);
	});

	it('still shows every answer of a stream that never echoed a prompt', () => {
		const { turns } = folded(STREAM.filter((e) => !e.isReplay));
		expect(turns.map((t) => t.question)).toEqual(['', '', '']);
		expect(turns.every((t) => t.blocks.some((b) => b.kind === 'text'))).toBe(true);
	});

	it('leaves a settled answer alone when the watch breaks between runs', () => {
		const firstResult = STREAM.findIndex((e) => e.type === 'result');
		const session = folded(STREAM.slice(0, firstResult + 1));
		const settled = JSON.stringify(session.turns[0].outcome);
		session.apply({ type: 'library_error' });
		expect(JSON.stringify(session.turns[0].outcome)).toBe(settled);
		expect(session.turns).toHaveLength(1);
	});

	it('carries on a run whose watch broke and was opened again', () => {
		const firstResult = STREAM.findIndex((e) => e.type === 'result');
		const session = folded(STREAM.slice(0, firstResult - 2));
		session.apply({ type: 'library_error' });
		expect(session.turns[0].outcome).toMatchObject({ unreachable: true });

		for (const event of STREAM) session.apply(event);
		expect(session.turns).toHaveLength(3);
		expect(session.turns[0].outcome).toMatchObject({ turns: 4, isError: false });
	});

	it('folds a frame the server added once, however often the watch replays it', () => {
		// The factory records its own error frame with no uuid. A watch opened
		// again while a later run is live replays it, and it must not land there.
		const firstResult = STREAM.findIndex((e) => e.type === 'result');
		const nextReplay = STREAM.findIndex((e, i) => i > firstResult && e.isReplay);
		const log = [
			...STREAM.slice(0, firstResult),
			{ type: 'library_error', error: 'wall clock' },
			...STREAM.slice(nextReplay, nextReplay + 3)
		];
		const session = folded(log);
		for (const event of log) session.apply(event);
		expect(session.turns[0].outcome).toMatchObject({ error: 'wall clock' });
		expect(session.turns[1].outcome).toBeNull();
		expect(session.working).toBe(true);
	});

	it('puts a stream that failed before it began on a turn of its own', () => {
		const session = new Session();
		session.apply({ type: 'library_error' });
		expect(session.turns).toHaveLength(1);
		expect(session.turns[0].outcome).toMatchObject({ unreachable: true });
	});
});
