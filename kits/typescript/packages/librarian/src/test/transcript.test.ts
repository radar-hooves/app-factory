/**
 * Milton is a person, not a place: `describe()` and `summariseActivity()`
 * feed the tool row and the activity summary, and neither may leak a tool
 * name, a raw path, or a collection count into what a reader sees.
 */
import { describe as vdescribe, it, expect } from 'vitest';
import {
	describe,
	outcomeLine,
	summariseActivity,
	Transcript,
	type ActivityGroup,
	type Outcome,
	type ToolBlock
} from '$lib/transcript.svelte';
import { DEFAULT_COPY } from '$lib/copy';

function tool(name: string, rawInput: Record<string, unknown>): ToolBlock {
	return { kind: 'tool', index: 0, name, rawInput: JSON.stringify(rawInput) };
}

vdescribe('describe()', () => {
	it('names a read in reader words, never the tool name or the raw path', () => {
		const said = describe(
			tool('Read', { file_path: '/data/staged/pspf-guidelines-2026/page-004.md' })
		);
		expect(said.verb).toBe('Read');
		expect(said.object).toBe('pspf guidelines 2026');
		expect(said.object).not.toContain('/');
		expect(said.object).not.toContain('page-004');
	});

	it('names a search in reader words', () => {
		const said = describe(tool('Grep', { pattern: 'recreation leave' }));
		expect(said.verb).toBe('Looked for');
		expect(said.object).toBe('recreation leave');
	});

	it('never surfaces a glob pattern or file path', () => {
		const said = describe(tool('Glob', { pattern: '**/pspf*.md' }));
		expect(said.verb).toBe('Looked for documents');
		expect(said.object).toBe('');
	});

	it('falls back to a mechanism-free phrase for an unrecognised tool', () => {
		const said = describe(tool('WebFetch', { url: 'https://example.com' }));
		expect(said.verb).toBe('Looked into it');
		expect(said.object).toBe('');
		expect(JSON.stringify(said)).not.toContain('WebFetch');
	});

	it('never lists a directory by name', () => {
		const said = describe(tool('Bash', { command: 'ls -1 collections/household-legal' }));
		expect(said.verb).toBe('Looked through the library');
		expect(said.object).toBe('');
	});
});

vdescribe('summariseActivity()', () => {
	it('counts searches and documents read, never a collection count', () => {
		const group: ActivityGroup = {
			kind: 'activity',
			index: 0,
			steps: [],
			tallies: [
				{ one: 'search', many: 'searches', count: 1 },
				{ one: 'document read', many: 'documents read', count: 2 }
			]
		};
		expect(summariseActivity(group)).toBe('1 search · 2 documents read');
	});

	it('falls back to a plain phrase when nothing was tallied', () => {
		const group: ActivityGroup = {
			kind: 'activity',
			index: 0,
			steps: [],
			tallies: []
		};
		expect(summariseActivity(group)).toBe('Looked into it');
	});
});

vdescribe('outcomeLine()', () => {
	const outcome: Outcome = { durationMs: 56_400, costUsd: 0.34 };

	it('renders exactly as before when the host never asked a depth', () => {
		expect(outcomeLine(outcome, undefined, DEFAULT_COPY)).toBe('56.4s');
	});

	it('names the depth and rounds the seconds once a host offers one', () => {
		expect(outcomeLine(outcome, 'quick', DEFAULT_COPY)).toBe('Quick · 56 s');
		expect(outcomeLine(outcome, 'thorough', DEFAULT_COPY)).toBe('Thorough · 56 s');
	});

	it("prices it in the host's own words once the host can price it", () => {
		const formatCost = (usd: number) => `about A$${(usd * 1.5).toFixed(2)}`;
		expect(outcomeLine(outcome, 'quick', DEFAULT_COPY, formatCost)).toBe(
			'Quick · 56 s · about A$0.51'
		);
	});

	it('never shows a cost for a local model that spent nothing', () => {
		const free: Outcome = { durationMs: 12_000, costUsd: 0 };
		const formatCost = (usd: number) => `about A$${usd}`;
		expect(outcomeLine(free, 'thorough', DEFAULT_COPY, formatCost)).toBe('Thorough · 12 s');
	});
});

vdescribe('Transcript error frame', () => {
	it('records an unreachable stream as a fact, and puts no words in anyone\'s mouth', () => {
		// The sentence names a persona; this layer does not know which one, so
		// it carries the fact and the rendering layer says it in the right voice.
		const transcript = new Transcript();
		transcript.apply({ type: 'library_error' });
		expect(transcript.outcome).toEqual({ isError: true, unreachable: true, error: undefined });
	});

	it('keeps a message the failure did carry', () => {
		const transcript = new Transcript();
		transcript.apply({ type: 'library_error', error: 'The room is closed for maintenance.' });
		expect(transcript.outcome?.error).toBe('The room is closed for maintenance.');
	});
});
