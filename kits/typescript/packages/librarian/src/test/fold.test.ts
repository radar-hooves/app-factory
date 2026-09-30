/**
 * The fold, against what the CLI really sends.
 *
 * With `--include-partial-messages` the CLI streams every block as deltas AND
 * then emits it whole; without it, only whole. The fold must read either and
 * print each block once. Every stream here was captured from the real CLI.
 */
import { describe, it, expect } from 'vitest';
import { Transcript, type ToolBlock } from '$lib/transcript.svelte';
import type { AgentEvent } from '$lib/client';
import { captured } from './fixtures/captured';

function fold(events: AgentEvent[]) {
	const transcript = new Transcript();
	for (const event of events) transcript.apply(event);
	return transcript;
}

describe('Transcript over a real stream', () => {
	it('prints each block once when the stream carries deltas and whole messages both', () => {
		const events = captured('chat-stream');
		const { blocks } = fold(events);
		const texts = blocks.filter((b) => b.kind === 'text');
		expect(texts.map((b) => b.kind === 'text' && b.text)).toEqual([
			events.find((e) => e.type === 'result')?.result
		]);
		expect(blocks.filter((b) => b.kind === 'tool')).toHaveLength(1);
	});

	it('gives each of two calls made at once its own result', () => {
		// Measured on the job stream: two Reads in one message, both calls
		// emitted before either result. These are real frames from a run whose
		// results happened to interleave, put back into that measured order.
		const events = captured('parallel-reads');
		const calls = events.filter((e) => contentTypes(e).includes('tool_use'));
		const results = events.filter((e) => contentTypes(e).includes('tool_result'));
		const rest = events.filter((e) => !calls.includes(e) && !results.includes(e));
		// After the first message's opening block, where the two calls stood.
		const opened = rest.findIndex((e) => e.type === 'assistant') + 1;
		const reordered = [...rest.slice(0, opened), ...calls, ...results, ...rest.slice(opened)];

		const tools = fold(reordered).blocks.filter((b): b is ToolBlock => b.kind === 'tool');
		expect(tools).toHaveLength(2);
		const [top, bottom] = tools;
		expect(top.rawInput).toContain('top.txt');
		expect(top.result).toContain('Milk 3.10');
		expect(bottom.rawInput).toContain('bottom.txt');
		expect(bottom.result).toContain('Cheese 9.95');
	});

	it('carries what a run returned under a schema onto its outcome', () => {
		const transcript = fold([{ type: 'result', is_error: false, structured_output: { lines: 6 } }]);
		expect(transcript.outcome?.structuredOutput).toEqual({ lines: 6 });
	});
});

function contentTypes(event: AgentEvent): unknown[] {
	const content = typeof event.message === 'object' ? event.message.content : undefined;
	return Array.isArray(content) ? content.map((block) => block.type) : [];
}
