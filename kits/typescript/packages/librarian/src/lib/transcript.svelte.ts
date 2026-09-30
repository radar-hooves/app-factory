/**
 * Fold Claude Code's event stream into what a reader needs to see.
 *
 * It folds, it does not translate: every block here is a real content block
 * from the stream (text, thinking, tool_use) and the fold only assembles the
 * deltas that belong to each. An event type this does not know about is kept
 * verbatim under `other`, so nothing is silently dropped.
 */

import type { AgentEvent } from './client';
import type { Citation } from './citations';

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
	/** The call's `tool_use` id, which its result names. */
	id?: string;
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
	/** A message the run itself gave. Words, never a code. */
	error?: string;
	/** The stream never opened, or died before the run said anything. The
	 *  sentence a reader sees is the persona's own (`copy.unreachable`), which
	 *  only the rendering layer knows, so this carries the FACT and no words. */
	unreachable?: boolean;
	/** What the run returned under `--json-schema`: the thing a host cards
	 *  as a turn's `artefact`. */
	structuredOutput?: unknown;
}

/**
 * The question as the READER asked it.
 *
 * A host prepends a system preamble to every question before it goes to the
 * library — cadmus sends `{room.preamble}\n\n{question}` — and echoing that
 * back into the transcript shows a colleague the machine room. Leading
 * blank-line-separated paragraphs addressed to the model are dropped.
 *
 * The LAST paragraph is never dropped, whatever it starts with: someone whose
 * entire question is "You are wrong about the leave rule" must still see it.
 */
export function readerQuestion(question: string): string {
	const parts = question.split(/\n{2,}/);
	let start = 0;
	while (
		start < parts.length - 1 &&
		/^(you are|you're|your role|act as|system:)\b/i.test(parts[start].trim())
	)
		start += 1;
	return parts.slice(start).join('\n\n').trim();
}

/** One tool call in the persona's own words: its row, its part of the
 *  activity line, and what it read. */
export interface ToolWords {
	/** What it did: "Read", "Looked for". */
	verb: string;
	/** What it did it to, beside the verb. */
	object: string;
	/** One dimmed line under the row. */
	detail?: string;
	/** How the activity line counts the call, singular and plural:
	 *  `['search', 'searches']` reads "2 searches". Absent is not counted. */
	tally?: [one: string, many: string];
	/** How the row counts a run of identical calls: `['page', 'pages']`
	 *  reads "· 5 pages". Absent reads "× 5". */
	repeat?: [one: string, many: string];
	/** Something the call read that a reader can open, listed under the
	 *  answer and handed back to the host's `oncite` when tapped. */
	source?: { id: string; title: string; section?: string };
}

/** A host's words for its persona's tools. `undefined` leaves the call to
 *  `describe()`, the package's own. */
export type DescribeTool = (block: ToolBlock) => ToolWords | undefined;

/** What Milton DID, in a reader's own words — never the tool's name or the
 * raw command it ran.
 *
 * The collapsed row is read by someone asking a question about documents, not
 * by an engineer: `Bash ls -1 .` tells them nothing and looks like a leak from
 * the machine room. Milton never narrates how he searched, so a tool this
 * does not recognise falls back to something that names no mechanism at all.
 * A persona with tools of its own brings a `DescribeTool` in front of this.
 */
export function describe(block: ToolBlock): ToolWords {
	const said = describeCall(block);
	const lines = block.result ? block.result.split('\n').length : 0;
	return lines ? { ...said, detail: lines === 1 ? '1 line' : `${lines} lines` } : said;
}

const READ: Pick<ToolWords, 'tally' | 'repeat'> = {
	tally: ['document read', 'documents read'],
	repeat: ['page', 'pages']
};
const SEARCH: Pick<ToolWords, 'tally'> = { tally: ['search', 'searches'] };

function describeCall(block: ToolBlock): ToolWords {
	const input = parseInput(block);
	const command = typeof input.command === 'string' ? input.command : '';

	if (block.name === 'Read') {
		const path = str(input.file_path ?? input.path);
		return { verb: 'Read', object: documentName(path), ...READ };
	}
	if (block.name === 'Grep') {
		return { verb: 'Looked for', object: str(input.pattern), ...SEARCH };
	}
	if (block.name === 'Glob') {
		return { verb: 'Looked for documents', object: '' };
	}
	if (block.name === 'Bash') {
		if (/\bgrep\b|\brg\b/.test(command)) {
			const quoted = command.match(/["']([^"']{2,60})["']/);
			return { verb: 'Looked for', object: quoted?.[1] ?? 'a phrase', ...SEARCH };
		}
		if (/\bls\b/.test(command)) return { verb: 'Looked through the library', object: '' };
		if (/\bfind\b/.test(command)) return { verb: 'Looked for documents', object: '' };
		if (/\bcat\b|\bhead\b|\bsed\b/.test(command)) {
			return { verb: 'Read', object: documentName(lastPath(command)), ...READ };
		}
		if (/\bwc\b/.test(command)) return { verb: 'Checked', object: '' };
		return { verb: 'Looked into it', object: '' };
	}
	return { verb: 'Looked into it', object: '' };
}

/** The host's words for a call, or the package's where it has none. */
export function wordsFor(block: ToolBlock, describeTool?: DescribeTool): ToolWords {
	return describeTool?.(block) ?? describe(block);
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
	/** Sources for the answer, from the library's own `citations` frame. */
	citations = $state<Citation[]>([]);
	/** Follow-ups the librarian named, from the `suggestions` frame after it. */
	suggestions = $state<string[]>([]);
	other = $state<AgentEvent[]>([]);

	#fold = foldState();

	reset() {
		this.blocks = [];
		this.outcome = null;
		this.citations = [];
		this.suggestions = [];
		this.other = [];
		this.#fold = foldState();
	}

	apply(event: AgentEvent) {
		this.version += 1;
		if (event.type === 'system' && event.subtype === 'init') {
			this.sessionId = event.session_id ?? null;
			this.model = (event.model as string) ?? null;
			return;
		}
		if (!fold(this, this.#fold, event)) this.other.push(event);
	}
}

/** What one turn's fold writes: a `Transcript`, or a turn of a `Session`. */
export interface FoldTarget {
	blocks: Block[];
	outcome: Outcome | null;
	citations?: Citation[];
	suggestions?: string[];
}

/** Where one turn's fold keeps its place between events. */
export interface FoldState {
	/** Content-block index is per MESSAGE, so it repeats across a turn; this
	 * maps the live index onto a position in the flat list. Cleared whenever a
	 * message starts, which is what stops message two overwriting message one. */
	open: Map<number, number>;
	/** The stream carries token-level deltas (`--include-partial-messages`),
	 * and the CLI then ALSO emits every message whole: folding both would
	 * print each block twice. A stream without the flag carries only the
	 * whole messages, and those are the turn. */
	partial: boolean;
}

// Deliberately a plain Map, not a SvelteMap: nothing renders it, it is
// written on every content-block delta while an answer streams, and giving
// each entry its own reactive signal would buy a re-render nobody reads.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
export const foldState = (): FoldState => ({ open: new Map(), partial: false });

/**
 * Fold one event into one turn. False for an event this does not know, which
 * the caller keeps rather than drops.
 *
 * It folds, it does not translate: every block is a real content block from
 * the stream, assembled from its deltas when the stream carries them and
 * taken whole when it does not.
 */
export function fold(into: FoldTarget, state: FoldState, event: AgentEvent): boolean {
	if (event.type === 'result') {
		into.outcome = {
			turns: event.num_turns,
			costUsd: event.total_cost_usd,
			durationMs: event.duration_ms,
			isError: event.is_error,
			structuredOutput: event.structured_output ?? undefined
		};
		return true;
	}

	// Emitted after the final assistant text, so it lands on a turn that is
	// otherwise complete. Both frames put their payload on `items`, so each
	// keeps only what its own shape admits: a `citations` frame carrying
	// strings, or a `suggestions` frame carrying objects, is the library
	// having changed under us, and rendering it would be worse than
	// rendering nothing.
	if (event.type === 'citations') {
		into.citations = (event.items ?? []).filter(
			(item): item is Citation => typeof item === 'object' && item !== null
		);
		return true;
	}

	// Last of the two, and only when the librarian named any.
	if (event.type === 'suggestions') {
		into.suggestions = (event.items ?? []).filter(
			(item): item is string => typeof item === 'string' && item.trim().length > 0
		);
		return true;
	}

	// No persona and no sentence at this layer: `client.ts` raises this for a
	// stream that would not open or died half-way, and the turn renders the
	// unreachable line in whichever persona's voice the host named.
	if (event.type === 'library_error') {
		into.outcome = { isError: true, unreachable: true, error: event.error };
		return true;
	}

	// A tool RESULT arrives as a user message carrying tool_result blocks, and
	// names its call by id: two calls made at once answer in either order, and
	// pinning a result on the latest open call put the first page's text under
	// the second page's row.
	if (event.type === 'user') {
		for (const block of contentOf(event)) {
			if (block.type !== 'tool_result') continue;
			const open = into.blocks.filter((b): b is ToolBlock => b.kind === 'tool' && !b.result);
			const target =
				open.find((b) => b.id !== undefined && b.id === block.tool_use_id) ?? open.at(-1);
			if (target) {
				target.result = renderResult(block.content);
				target.isError = block.is_error === true;
			}
		}
		return true;
	}

	// One whole content block per event, several events per message — measured
	// on Claude Code 2.1.283, where every one carries `stop_reason: null`.
	if (event.type === 'assistant') {
		if (state.partial) return true;
		for (const block of contentOf(event)) {
			const whole = wholeBlock(block, into.blocks.length);
			if (whole) into.blocks.push(whole);
		}
		return true;
	}

	if (event.type !== 'stream_event' || !event.event) return false;

	state.partial = true;
	const inner = event.event;
	if (inner.type === 'message_start') {
		state.open.clear();
		return true;
	}
	if (inner.type === 'content_block_start' && inner.index !== undefined) {
		const cb = inner.content_block;
		if (!cb) return true;
		const position = into.blocks.length;
		state.open.set(inner.index, position);
		if (cb.type === 'text') into.blocks.push({ kind: 'text', index: position, text: '' });
		else if (cb.type === 'thinking')
			into.blocks.push({ kind: 'thinking', index: position, text: '' });
		else if (cb.type === 'tool_use')
			into.blocks.push({
				kind: 'tool',
				index: position,
				id: cb.id,
				name: cb.name ?? 'tool',
				rawInput: ''
			});
		return true;
	}
	if (inner.type === 'content_block_delta' && inner.index !== undefined) {
		const position = state.open.get(inner.index);
		if (position === undefined) return true;
		const block = into.blocks[position];
		const delta = inner.delta;
		if (!block || !delta) return true;
		if (delta.type === 'text_delta' && block.kind === 'text') block.text += delta.text ?? '';
		else if (delta.type === 'thinking_delta' && block.kind === 'thinking')
			block.text += delta.thinking ?? '';
		else if (delta.type === 'input_json_delta' && block.kind === 'tool')
			block.rawInput += delta.partial_json ?? '';
	}
	return true;
}

/** A message's content blocks; a user frame may carry a bare string instead. */
export function contentOf(event: AgentEvent): Array<Record<string, unknown>> {
	const content = typeof event.message === 'object' ? event.message.content : undefined;
	return Array.isArray(content) ? content : [];
}

function wholeBlock(block: Record<string, unknown>, index: number): Block | null {
	if (block.type === 'text') return { kind: 'text', index, text: str(block.text) };
	if (block.type === 'thinking') return { kind: 'thinking', index, text: str(block.thinking) };
	if (block.type === 'tool_use') {
		return {
			kind: 'tool',
			index,
			id: str(block.id) || undefined,
			name: str(block.name) || 'tool',
			rawInput: JSON.stringify(block.input ?? {})
		};
	}
	return null;
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
	/** The block this step stands for; a repeated step keeps the FIRST.
	 *
	 * A `text` block here is interstitial narration, not the answer — see
	 * `segment()`. */
	block: Block;
	/** How many identical consecutive steps collapsed into this one. */
	repeats: number;
	/** A tool step in the persona's words, resolved once here so the row, the
	 *  count and the collapse all agree. */
	words?: ToolWords;
}

/** One count on the activity line: "2 searches". */
export interface Tally {
	one: string;
	many: string;
	count: number;
}

export interface ActivityGroup {
	kind: 'activity';
	index: number;
	steps: ActivityStep[];
	/** What the steps counted as, in the order each first appeared. */
	tallies: Tally[];
}

export type Segment = ActivityGroup | TextBlock;

/** One question and the answer to it, as the transcript renders it.
 *
 * A finished turn is a plain object the host keeps in a list; the LIVE turn is
 * a `Transcript` spread into the same shape. Both render identically, which is
 * what stops a conversation flickering as the last turn settles. */
export interface Turn {
	id: string;
	question: string;
	/** When the question was asked, epoch ms. A host that persists its
	 *  conversations supplies it; a host that does not gets one stamped when
	 *  the turn first appears on screen, which is right for a live turn and
	 *  honestly absent for one read back out of history. */
	at?: number;
	blocks: Block[];
	outcome: Outcome | null;
	citations?: Citation[];
	/** Follow-ups offered after this answer. Absent on a turn read back from
	 *  history: they belonged to the moment it was asked. */
	suggestions?: string[];
	/** Something this turn produced for the reader to open, carded under the
	 *  answer once the turn settles. */
	artefact?: Artefact;
	/** What the host asked for when this was not a plain question
	 *  (`'briefing'`), in its own word, as `client.ask()` sent it. */
	kind?: string;
}

/** A turn's artefact, in the host's own words. */
export interface Artefact {
	title: string;
	/** One line under the title: what it holds. */
	summary?: string;
	/** The answer's prose IS the artefact (a briefing the persona wrote): it
	 *  opens in the reading column, and the turn shows the card alone once it
	 *  settles. Absent, the artefact is something beside the answer, and the
	 *  card sits under the prose. */
	isAnswer?: boolean;
}

/**
 * Fold a turn's flat block list into what a reader should actually see.
 *
 * Three problems this solves, all reported off a real transcript:
 *
 * 1. Fifteen tool rows stood between the question and the first word of the
 *    answer, so the answer had to be scrolled to. Contiguous activity becomes
 *    ONE group the caller can collapse.
 * 2. "Reading pspf guidelines 2026" appeared five times in a row — five pages
 *    of one document, which is one act of reading to a human. Consecutive
 *    steps with the same label collapse to one row carrying a count.
 * 3. Milton's between-tool narration was rendering unfolded, as answer prose.
 *    The caller stream carries no `thinking` blocks at all — measured on
 *    production 11/09/2026 — so "Let me also check whether…" arrives as an
 *    ordinary `text` block, indistinguishable from the answer except by
 *    POSITION. A text block with any tool call still to come in this turn is
 *    narration; only the run of text after the LAST tool call is the answer.
 *    Narration folds into the activity group as a thinking-shaped step.
 *
 * That third rule is provisional while a turn streams, and deliberately so: a
 * text block that is currently last IS the answer as far as anything can know,
 * and renders as prose. The tool call that arrives after it re-homes it into
 * the group. Nothing here holds state to make that work — `segment` is pure
 * and re-derived on every event, so re-homing is just the next call returning
 * a different shape.
 *
 * The cost of the rule is a real answer that Milton interrupts to go back to
 * the shelf: its first half folds away. That is the trade taken knowingly —
 * the position of a block is the only signal the stream gives, and a rule read
 * off the prose itself would be unexplainable the first time it misfired.
 */
export function segment(blocks: Block[], describeTool?: DescribeTool): Segment[] {
	const out: Segment[] = [];
	let current: ActivityGroup | null = null;

	let lastTool = -1;
	for (let i = 0; i < blocks.length; i += 1) if (isStep(blocks[i])) lastTool = i;

	for (const [i, block] of blocks.entries()) {
		if (block.kind === 'tool' && !isStep(block)) continue;
		if (block.kind === 'text' && i > lastTool) {
			current = null;
			out.push(block);
			continue;
		}
		// A thinking block with no text is a row whose chevron opens on nothing.
		// Claude Code's thinking display defaults to "omitted", so most arrive
		// empty — rendering them is worse than dropping them. An empty narration
		// block is the same row, for the same reason.
		if (block.kind !== 'tool' && !block.text.trim()) continue;
		if (!current) {
			current = { kind: 'activity', index: block.index, steps: [], tallies: [] };
			out.push(current);
		}
		const words = block.kind === 'tool' ? wordsFor(block, describeTool) : undefined;
		const last = current.steps.at(-1);
		if (last && sameStep(last, block, words)) {
			last.repeats += 1;
		} else {
			current.steps.push({ block, repeats: 1, words });
		}
		if (words?.tally) count(current, words.tally);
	}
	return out;
}

/**
 * The tool the CLI adds under `--json-schema`. Calling it hands in the run's
 * answer, which arrives again whole on the `result` (`structured_output`): it
 * is not a step of the work, and the words before it are the answer, not
 * narration ahead of more work. Measured on Claude Code 2.1.283, where a run
 * with a schema always ends in this call.
 */
const HANDS_IN = 'StructuredOutput';

/** A call that is part of the work, rather than the handing-in of its answer. */
function isStep(block: Block): boolean {
	return block.kind === 'tool' && block.name !== HANDS_IN;
}

function sameStep(last: ActivityStep, block: Block, words: ToolWords | undefined): boolean {
	if (last.block.kind !== block.kind) return false;
	if (block.kind === 'thinking') return true;
	// Two narration sentences are two things Milton said; collapsing them to
	// one row with a count would lose the second one entirely.
	if (block.kind === 'text') return false;
	return last.words?.verb === words?.verb && last.words?.object === words?.object;
}

function count(group: ActivityGroup, [one, many]: [string, string]): void {
	const seen = group.tallies.find((t) => t.one === one && t.many === many);
	if (seen) seen.count += 1;
	else group.tallies.push({ one, many, count: 1 });
}

/** One line describing a whole investigation, for the collapsed state.
 *
 * Counts of what the persona did are fine ("1 search · 2 documents read"); how
 * it organises what it knows is not — no collection count, no shelf, no corpus.
 */
export function summariseActivity(group: ActivityGroup): string {
	const parts = group.tallies.map((t) => `${t.count} ${t.count === 1 ? t.one : t.many}`);
	return parts.length ? parts.join(' · ') : 'Looked into it';
}

/**
 * What a turn's calls read that a reader can open, numbered in the order it
 * was first read: the host's `ToolWords.source`, as the sources the answer
 * lists under itself. A call still running, or one that failed, read nothing.
 *
 * `derived`, because nothing checked any of it against a publisher: a trust
 * mark on a page the persona just looked at would be a claim about a record
 * nobody read.
 */
export function readFrom(blocks: Block[], describeTool?: DescribeTool): Citation[] {
	const out: Citation[] = [];
	for (const block of blocks) {
		if (block.kind !== 'tool' || !isStep(block) || block.result === undefined || block.isError)
			continue;
		const source = wordsFor(block, describeTool).source;
		if (!source || out.some((c) => c.document_id === source.id)) continue;
		out.push({
			n: out.length + 1,
			document_id: source.id,
			title: source.title,
			section: source.section,
			derived: true
		});
	}
	return out;
}
