/**
 * A turn's steps, said in one sentence.
 *
 * The turn folds its steps behind one line composed from them ("Read your
 * attachment, searched the library and the web, and wrote a minute"), the way
 * Claude.ai folds its own. Composed here from what each step IS (its tool and,
 * for a document, the document's own kind), never from the persona's words.
 */

import { fill, type ChatCopy } from './copy';
import type { ActivityStep, Block, ToolBlock } from './transcript.svelte';
import type { Written } from './written';

export type StepKind =
	| 'attachment'
	| 'library'
	| 'web'
	| 'open'
	| 'write'
	| 'edit'
	| 'thought'
	| 'other';

const WEB = new Set(['mcp__supacrawl__supacrawl_search', 'mcp__supacrawl__supacrawl_scrape']);

/** What sort of step a block is. */
export function stepKind(block: Block): StepKind {
	if (block.kind !== 'tool') return 'thought';
	const { name } = block;
	if (name === 'mcp__library__search') return 'library';
	if (name === 'mcp__library__document_content' || name === 'mcp__library__document_detail')
		return 'open';
	if (WEB.has(name)) return 'web';
	if (name === 'Write') return 'write';
	if (name === 'Edit') return 'edit';
	if (name.startsWith('mcp__') && name.endsWith('__ocr')) return 'attachment';
	if (name === 'Read') {
		// A staged library page reads as a document opened; anything else Read
		// takes is what the person attached.
		const path = pathOf(block);
		return /page-\d+\.md$/.test(path) ? 'open' : 'attachment';
	}
	return 'other';
}

function inputOf(block: ToolBlock): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(block.rawInput);
		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

const pathOf = (block: ToolBlock): string => {
	const input = inputOf(block);
	const path = input.file_path ?? input.path;
	return typeof path === 'string' ? path : '';
};

/** The document a Write or Edit step made a version of, by the name it wrote to. */
function documentOf(block: ToolBlock, written: Written[]): Written | undefined {
	const path = pathOf(block);
	if (!path) return undefined;
	return written.filter((w) => path === w.name || path.endsWith(`/${w.name}`)).at(-1);
}

const kindWord = (doc: Written | undefined, words: ChatCopy): string =>
	((doc?.kind ?? '').trim() || words.documentKind).toLowerCase();

const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function join(phrases: string[], and: string): string {
	if (phrases.length <= 2) return phrases.join(` ${and} `);
	return `${phrases.slice(0, -1).join(', ')}, ${and} ${phrases.at(-1)}`;
}

/**
 * The fold's line: the sentence, and what trails it ("6 steps", or the
 * version a lone edit made).
 */
export function stepsSummary(
	steps: ActivityStep[],
	written: Written[],
	words: ChatCopy
): { sentence: string; trail: string } {
	let library = false;
	let web = false;
	let searchAt = -1;
	const phrases: string[] = [];
	const add = (phrase: string) => {
		if (!phrases.includes(phrase)) phrases.push(phrase);
	};

	for (const { block } of steps) {
		const kind = stepKind(block);
		const doc = block.kind === 'tool' ? documentOf(block, written) : undefined;
		if (kind === 'library' || kind === 'web') {
			if (kind === 'library') library = true;
			else web = true;
			if (searchAt < 0) {
				searchAt = phrases.length;
				phrases.push('');
			}
		} else if (kind === 'attachment') add(words.stepsRead);
		else if (kind === 'open') add(words.stepsOpened);
		else if (kind === 'write') add(fill(words.stepsWrote, { kind: kindWord(doc, words) }));
		else if (kind === 'edit') add(fill(words.stepsEdited, { kind: kindWord(doc, words) }));
		else if (kind === 'other') add(words.stepsOther);
	}
	if (searchAt >= 0)
		phrases[searchAt] =
			library && web ? words.stepsSearchedBoth : library ? words.stepsSearchedLibrary : words.stepsSearchedWeb;
	// Thinking is told only where it is all there was.
	if (phrases.length === 0) phrases.push(words.stepsThought);

	const only = steps.length === 1 ? steps[0].block : undefined;
	const lone = only?.kind === 'tool' && stepKind(only) === 'edit' ? documentOf(only, written) : undefined;
	return {
		sentence: upper(join(phrases, words.stepsAnd)),
		trail: lone
			? fill(words.writtenVersion, { n: lone.version })
			: steps.length === 1
				? words.stepCountOne
				: fill(words.stepCount, { n: steps.length })
	};
}

/** What is happening now: the step still running, or the latest one. */
export function stepsNow(steps: ActivityStep[], written: Written[], words: ChatCopy): string {
	const step = steps.findLast(({ block }) => block.kind === 'tool' && block.result === undefined)
		?? steps.at(-1);
	if (!step) return words.nowOther;
	const kind = stepKind(step.block);
	const doc = step.block.kind === 'tool' ? documentOf(step.block, written) : undefined;
	const now: Record<StepKind, string> = {
		attachment: words.nowRead,
		library: words.nowLibrary,
		web: words.nowWeb,
		open: words.nowOpen,
		write: fill(words.nowWrite, { kind: kindWord(doc, words) }),
		edit: fill(words.nowEdit, { kind: kindWord(doc, words) }),
		thought: words.nowThought,
		other: words.nowOther
	};
	return now[kind];
}

function parse(text: string | undefined): unknown {
	try {
		return text ? JSON.parse(text) : undefined;
	} catch {
		return undefined;
	}
}

/** The count at a step's right hand, where its result shows one. */
export function stepMeta(block: Block, words: ChatCopy): string {
	if (block.kind !== 'tool' || block.isError || block.result === undefined) return '';
	if (block.name === 'mcp__library__search') {
		const found = parse(block.result) as { hits?: unknown; results?: unknown } | unknown[] | undefined;
		const list = Array.isArray(found) ? found : (found?.hits ?? found?.results);
		return Array.isArray(list) ? fill(words.stepFound, { n: list.length }) : '';
	}
	if (block.name === 'mcp__supacrawl__supacrawl_search') {
		const found = (parse(block.result) as { results?: unknown } | undefined)?.results;
		if (!Array.isArray(found)) return '';
		return found.length === 1 ? words.stepPageRead : fill(words.stepPagesRead, { n: found.length });
	}
	return '';
}

/** How long a thinking block ran, in whole seconds, where it was timed. */
export function thoughtSeconds(block: Block): number | undefined {
	if (block.kind !== 'thinking' || block.startedAt === undefined || block.endedAt === undefined)
		return undefined;
	return Math.max(1, Math.round((block.endedAt - block.startedAt) / 1000));
}
