/**
 * The line a turn's steps fold behind: composed from what the steps were,
 * never from the persona's words.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_COPY } from '$lib/copy';
import { stepKind, stepMeta, stepsNow, stepsSummary } from '$lib/steps';
import { segment, type ActivityGroup, type Block } from '$lib/transcript.svelte';
import type { Written } from '$lib/written';

const tool = (name: string, input: Record<string, unknown>, result?: string, index = 0): Block => ({
	kind: 'tool',
	index,
	name,
	rawInput: JSON.stringify(input),
	result
});

const steps = (blocks: Block[]) => (segment(blocks)[0] as ActivityGroup).steps;

const minute = (version: number, kind: string | null = 'minute'): Written => ({
	name: 'rent-ceiling.md',
	version,
	media_type: 'text/markdown',
	formats: ['docx'],
	title: 'Minute',
	kind,
	changes: null,
	pages: 1
});

const turn: Block[] = [
	{ kind: 'thinking', index: 0, text: 'Which rate?' },
	tool('Read', { file_path: '/chat/files/lease.pdf' }, 'text', 1),
	tool('mcp__library__search', { query: 'rent ceilings' }, '{"hits":[1,2,3]}', 2),
	tool('mcp__library__document_content', { id: 4 }, 'x', 3),
	tool('mcp__supacrawl__supacrawl_search', { query: 'rent ceiling' }, '{"results":[{},{}]}', 4),
	tool('Write', { file_path: '/chat/rent-ceiling.md' }, 'ok', 5),
	{ kind: 'text', index: 6, text: 'Done.' }
];

describe('the fold’s sentence', () => {
	it('names each kind of step once, joins the two searches, and counts the steps', () => {
		expect(stepsSummary(steps(turn), [minute(1)], DEFAULT_COPY)).toEqual({
			sentence:
				'Read your attachment, searched the library and the web, opened a document, and wrote a minute',
			trail: '6 steps'
		});
	});

	it('says only what happened: one search, a lone phrase, a document of no kind', () => {
		expect(
			stepsSummary(steps([tool('mcp__library__search', { query: 'q' }, '{}')]), [], DEFAULT_COPY)
		).toEqual({ sentence: 'Searched the library', trail: '1 step' });
		expect(
			stepsSummary(
				steps([tool('mcp__supacrawl__supacrawl_search', { query: 'q' }, '{}')]),
				[],
				DEFAULT_COPY
			).sentence
		).toBe('Searched the web');
		expect(
			stepsSummary(steps([tool('Write', { file_path: '/chat/rent-ceiling.md' }, 'ok')]), [minute(1, null)], DEFAULT_COPY)
				.sentence
		).toBe('Wrote a document');
		expect(
			stepsSummary(steps([tool('Write', { file_path: '/chat/other.md' }, 'ok')]), [], DEFAULT_COPY).sentence
		).toBe('Wrote a document');
	});

	it('joins two with "and" and says a thought only where it is all there was', () => {
		const two = [
			tool('Read', { file_path: '/chat/files/a.pdf' }, 'x', 0),
			tool('mcp__library__search', { query: 'q' }, '{}', 1)
		];
		expect(stepsSummary(steps(two), [], DEFAULT_COPY).sentence).toBe(
			'Read your attachment and searched the library'
		);
		expect(
			stepsSummary(steps([{ kind: 'thinking', index: 0, text: 'Hmm' }]), [], DEFAULT_COPY).sentence
		).toBe('Thought');
	});

	it('reads a follow-up whose only step edited a document as "Edited the minute · v2"', () => {
		const edit = steps([tool('Edit', { file_path: '/chat/rent-ceiling.md' }, 'ok')]);
		expect(stepsSummary(edit, [minute(1), minute(2)], DEFAULT_COPY)).toEqual({
			sentence: 'Edited the minute',
			trail: 'v2'
		});
	});

	it('says what is happening now: the step still running', () => {
		const running = steps([
			tool('Read', { file_path: '/chat/files/a.pdf' }, 'x', 0),
			tool('mcp__library__search', { query: 'q' }, undefined, 1)
		]);
		expect(stepsNow(running, [], DEFAULT_COPY)).toBe('Searching the library…');
		expect(
			stepsNow(steps([tool('Write', { file_path: '/chat/rent-ceiling.md' })]), [minute(1)], DEFAULT_COPY)
		).toBe('Writing a minute…');
	});
});

describe('a step’s kind and its count', () => {
	it('tells an attachment from a staged library page', () => {
		expect(stepKind(tool('Read', { file_path: '/chat/files/lease.pdf' }))).toBe('attachment');
		expect(stepKind(tool('Read', { file_path: '/lib/annex-7e/page-004.md' }))).toBe('open');
		expect(stepKind(tool('mcp__litellm__ocr', {}))).toBe('attachment');
		expect(stepKind(tool('Bash', { command: 'ls' }))).toBe('other');
	});

	it('counts what a search found where the result shows it, and nothing where it does not', () => {
		expect(stepMeta(turn[2], DEFAULT_COPY)).toBe('3 found');
		expect(stepMeta(turn[4], DEFAULT_COPY)).toBe('2 pages read');
		expect(stepMeta(tool('mcp__library__search', {}, 'not json'), DEFAULT_COPY)).toBe('');
		expect(stepMeta(tool('mcp__library__search', {}, '{"hits":[]}'), DEFAULT_COPY)).toBe('0 found');
		expect(stepMeta(tool('mcp__library__search', {}, undefined), DEFAULT_COPY)).toBe('');
		expect(stepMeta(turn[1], DEFAULT_COPY)).toBe('');
	});
});
