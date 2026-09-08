/**
 * Fold Claude Code's event stream into what a reader needs to see.
 *
 * It folds, it does not translate: every block here is a real content block
 * from the stream (text, thinking, tool_use) and the fold only assembles the
 * deltas that belong to each. An event type this does not know about is kept
 * verbatim under `other`, so nothing is silently dropped.
 */

import type { AgentEvent } from './client';

export interface TextBlock {
	kind: 'text';
	index: number;
	text: string;
}

export interface ThinkingBlock {
	kind: 'thinking';
	index: number;
	text: string;
}

export interface ToolBlock {
	kind: 'tool';
	index: number;
	name: string;
	/** Accumulated `input_json_delta`. Parsed lazily — it is invalid JSON mid-stream. */
	rawInput: string;
	result?: string;
	isError?: boolean;
}

export type Block = TextBlock | ThinkingBlock | ToolBlock;

export interface Outcome {
	turns?: number;
	costUsd?: number;
	durationMs?: number;
	isError?: boolean;
	error?: string;
}

/** What the agent is DOING, in words a reader who has never seen a shell knows.
 *
 * The collapsed row is read by someone asking a question about documents, not
 * by an engineer: `Bash ls -1 .` tells them nothing and looks like a leak from
 * the machine room. The raw command is still one click away on expand, so this
 * hides nothing — it just stops the transcript opening with jargon.
 */
export function describe(block: ToolBlock): { verb: string; object: string } {
	const input = parseInput(block);
	const command = typeof input.command === 'string' ? input.command : '';

	if (block.name === 'Read') {
		const path = str(input.file_path ?? input.path);
		return { verb: 'Reading', object: documentName(path) };
	}
	if (block.name === 'Grep') {
		return { verb: 'Searching for', object: str(input.pattern) };
	}
	if (block.name === 'Glob') {
		return { verb: 'Looking for files', object: str(input.pattern) };
	}
	if (block.name === 'Bash') {
		if (/\bgrep\b|\brg\b/.test(command)) {
			const quoted = command.match(/["']([^"']{2,60})["']/);
			return { verb: 'Searching for', object: quoted?.[1] ?? 'a phrase' };
		}
		if (/\bls\b/.test(command)) return { verb: 'Listing', object: listTarget(command) };
		if (/\bfind\b/.test(command)) return { verb: 'Looking for files', object: '' };
		if (/\bcat\b|\bhead\b|\bsed\b/.test(command)) {
			return { verb: 'Reading', object: documentName(lastPath(command)) };
		}
		if (/\bwc\b/.test(command)) return { verb: 'Counting', object: '' };
		return { verb: 'Running a command', object: '' };
	}
	return { verb: block.name, object: summarise(block) };
}

function parseInput(block: ToolBlock): Record<string, unknown> {
	try {
		return JSON.parse(block.rawInput) as Record<string, unknown>;
	} catch {
		return {};
	}
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A staged path ends with the document's title slug; that is its name. */
function documentName(path: string): string {
	if (!path) return '';
	const segments = path.split('/').filter((s) => s && s !== '.');
	const page = segments.at(-1) ?? '';
	// `.../<title-slug>/page-004.md` — the page number is noise, the slug is not.
	if (/^page-\d+\.md$/.test(page)) return prettify(segments.at(-2) ?? '');
	return prettify(page.replace(/\.md$/, ''));
}

function listTarget(command: string): string {
	const target = command.trim().split(/\s+/).at(-1) ?? '';
	if (!target || target === '.' || target.startsWith('-')) return 'the collections';
	return prettify(target.replace(/\/$/, ''));
}

function lastPath(command: string): string {
	return (
		command
			.split(/\s+/)
			.filter((t) => t.includes('/') || t.endsWith('.md'))
			.at(-1) ?? ''
	);
}

/** Slugs are the corpus's own titles; a reader should see words, not kebab-case. */
function prettify(slug: string): string {
	if (!slug) return '';
	return slug.replace(/[-_]+/g, ' ');
}

/** Best-effort one-line summary of a tool call, for the collapsed row.
 *
 * A staged path leads with a 64-character content hash and ends with the
 * document's title — so truncating from the LEFT, as a path naturally does,
 * shows the reader the noise and cuts the signal. Paths are elided from the
 * front instead, which is why this is not just `slice(0, n)`.
 */
export function summarise(block: ToolBlock): string {
	let value = block.rawInput.slice(0, 200);
	try {
		const input = JSON.parse(block.rawInput) as Record<string, unknown>;
		const first =
			input.command ?? input.pattern ?? input.file_path ?? input.path ?? input.description;
		if (typeof first === 'string') value = first;
	} catch {
		/* mid-stream JSON is expected to be partial */
	}
	return value.includes('/') ? elidePath(value) : value;
}

/** Keep the last two path segments — the document title and the page. */
function elidePath(value: string): string {
	const segments = value.split('/').filter(Boolean);
	if (segments.length <= 2) return value;
	return `…/${segments.slice(-2).join('/')}`;
}

export class Transcript {
	blocks = $state<Block[]>([]);
	/** Bumped on every applied event.
	 *
	 * Streaming grows an EXISTING block's `.text` in place, and Svelte's
	 * fine-grained tracking never sees that unless something reads it. An
	 * effect keyed on `blocks.length` therefore fires when a new block is
	 * pushed and never again — which is why a single long prose answer used to
	 * stream 870px past the fold with auto-scroll still "pinned" at the top.
	 * Consumers key on this instead. */
	version = $state(0);
	sessionId = $state<string | null>(null);
	model = $state<string | null>(null);
	outcome = $state<Outcome | null>(null);
	other = $state<AgentEvent[]>([]);

	/** Content-block index is per MESSAGE, so it repeats across turns; this
	 * maps the live index onto a position in the flat list. Cleared whenever a
	 * message starts, which is what stops turn two overwriting turn one. */
	// Deliberately a plain Map, not a SvelteMap: nothing renders it, it is
	// written on every content-block delta while an answer streams, and giving
	// each entry its own reactive signal would buy a re-render nobody reads.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#open = new Map<number, number>();

	reset() {
		this.blocks = [];
		this.outcome = null;
		this.other = [];
		this.#open.clear();
	}

	apply(event: AgentEvent) {
		this.version += 1;
		if (event.type === 'system' && event.subtype === 'init') {
			this.sessionId = event.session_id ?? null;
			this.model = (event.model as string) ?? null;
			return;
		}

		if (event.type === 'result') {
			this.outcome = {
				turns: event.num_turns,
				costUsd: event.total_cost_usd,
				durationMs: event.duration_ms,
				isError: event.is_error
			};
			return;
		}

		if (event.type === 'library_error') {
			this.outcome = { isError: true, error: event.error ?? 'the agent failed' };
			return;
		}

		// A tool RESULT arrives as a user message carrying tool_result blocks.
		if (event.type === 'user') {
			for (const block of event.message?.content ?? []) {
				if (block.type !== 'tool_result') continue;
				const target = [...this.blocks].reverse().find((b) => b.kind === 'tool' && !b.result);
				if (target && target.kind === 'tool') {
					target.result = renderResult(block.content);
					target.isError = block.is_error === true;
				}
			}
			return;
		}

		if (event.type !== 'stream_event' || !event.event) {
			if (event.type !== 'assistant') this.other.push(event);
			return;
		}

		const inner = event.event;
		if (inner.type === 'message_start') {
			this.#open.clear();
			return;
		}
		if (inner.type === 'content_block_start' && inner.index !== undefined) {
			const cb = inner.content_block;
			if (!cb) return;
			const position = this.blocks.length;
			this.#open.set(inner.index, position);
			if (cb.type === 'text') this.blocks.push({ kind: 'text', index: position, text: '' });
			else if (cb.type === 'thinking')
				this.blocks.push({ kind: 'thinking', index: position, text: '' });
			else if (cb.type === 'tool_use')
				this.blocks.push({
					kind: 'tool',
					index: position,
					name: cb.name ?? 'tool',
					rawInput: ''
				});
			return;
		}
		if (inner.type === 'content_block_delta' && inner.index !== undefined) {
			const position = this.#open.get(inner.index);
			if (position === undefined) return;
			const block = this.blocks[position];
			const delta = inner.delta;
			if (!block || !delta) return;
			if (delta.type === 'text_delta' && block.kind === 'text') block.text += delta.text ?? '';
			else if (delta.type === 'thinking_delta' && block.kind === 'thinking')
				block.text += delta.thinking ?? '';
			else if (delta.type === 'input_json_delta' && block.kind === 'tool')
				block.rawInput += delta.partial_json ?? '';
		}
	}
}

function renderResult(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) =>
				typeof part === 'object' && part !== null && 'text' in part
					? String((part as { text: unknown }).text)
					: ''
			)
			.join('');
	}
	return '';
}

// ── Grouping: what the reader sees instead of every step ─────────────────────

export interface ActivityStep {
	/** The block this step stands for; a repeated step keeps the FIRST. */
	block: ToolBlock | ThinkingBlock;
	/** How many identical consecutive steps collapsed into this one. */
	repeats: number;
}

export interface ActivityGroup {
	kind: 'activity';
	index: number;
	steps: ActivityStep[];
	/** Distinct collections touched, for the one-line summary. */
	collections: string[];
	documents: number;
	searches: number;
}

export type Segment = ActivityGroup | TextBlock;

/**
 * Fold a turn's flat block list into what a reader should actually see.
 *
 * Two problems this solves, both reported off a real transcript:
 *
 * 1. Fifteen tool rows stood between the question and the first word of the
 *    answer, so the answer had to be scrolled to. Contiguous activity becomes
 *    ONE group the caller can collapse.
 * 2. "Reading pspf guidelines 2026" appeared five times in a row — five pages
 *    of one document, which is one act of reading to a human. Consecutive
 *    steps with the same label collapse to one row carrying a count.
 */
export function segment(blocks: Block[]): Segment[] {
	const out: Segment[] = [];
	let current: ActivityGroup | null = null;

	for (const block of blocks) {
		if (block.kind === 'text') {
			current = null;
			out.push(block);
			continue;
		}
		// A thinking block with no text is a row whose chevron opens on nothing.
		// Claude Code's thinking display defaults to "omitted", so most arrive
		// empty — rendering them is worse than dropping them.
		if (block.kind === 'thinking' && !block.text.trim()) continue;
		if (!current) {
			current = {
				kind: 'activity',
				index: block.index,
				steps: [],
				collections: [],
				documents: 0,
				searches: 0
			};
			out.push(current);
		}
		const last = current.steps.at(-1);
		if (last && sameStep(last.block, block)) {
			last.repeats += 1;
		} else {
			current.steps.push({ block, repeats: 1 });
		}
		if (block.kind === 'tool') tally(current, block);
	}
	return out;
}

function sameStep(a: ToolBlock | ThinkingBlock, b: ToolBlock | ThinkingBlock): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'thinking') return true;
	const left = describe(a as ToolBlock);
	const right = describe(b as ToolBlock);
	return left.verb === right.verb && left.object === right.object;
}

function tally(group: ActivityGroup, block: ToolBlock): void {
	const { verb } = describe(block);
	if (verb === 'Searching for') group.searches += 1;
	if (verb === 'Reading') group.documents += 1;
	const collection = collectionOf(block);
	if (collection && !group.collections.includes(collection)) group.collections.push(collection);
}

/** The first path segment under the corpus root IS the collection name. */
function collectionOf(block: ToolBlock): string {
	const raw = block.rawInput;
	const match = raw.match(/(?:^|["'\s/])([a-z0-9]+(?:-[a-z0-9]+)+)\/local\//);
	return match?.[1] ?? '';
}

/** One line describing a whole investigation, for the collapsed state. */
export function summariseActivity(group: ActivityGroup): string {
	const parts: string[] = [];
	if (group.searches) parts.push(`${group.searches} search${group.searches === 1 ? '' : 'es'}`);
	if (group.documents)
		parts.push(`${group.documents} document${group.documents === 1 ? '' : 's'} read`);
	if (group.collections.length)
		parts.push(
			`${group.collections.length} collection${group.collections.length === 1 ? '' : 's'}`
		);
	return parts.length ? parts.join(' · ') : 'Worked on it';
}
