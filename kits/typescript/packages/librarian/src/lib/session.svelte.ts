/**
 * A whole session as a conversation: every run a stream carries, each one a
 * turn with the reader's words on one side and the persona's on the other.
 *
 * `Transcript` folds the events of ONE question the host asked. A session the
 * APP started — a job that reads a document with nobody asking — is a
 * different stream: its prompt and every later message arrive as the CLI
 * echoes each one back (`--replay-user-messages`), and each run ends in its
 * own `result`. So a replayed user frame opens a turn, everything after it
 * folds into that turn, and its `result` settles it.
 *
 * Every Claude Code event carries a `uuid`, and one already folded is
 * skipped: a watch route replays from the first event, so opening it again
 * after the session moves on folds only what is new. A frame the server adds
 * itself (an error, the library's citations) carries none, and is known by
 * the event it follows.
 */

import type { AgentEvent } from './client';
import { contentOf, fold, foldState, type FoldState, type Turn } from './transcript.svelte';

/** The events a run is made of. One arriving after its turn settled is the
 *  next run, whether or not its prompt was echoed. */
const RUN = new Set(['stream_event', 'assistant', 'user', 'result']);

/** Everything else that lands on a turn: the library's trailing frames, and
 *  a stream that broke. Anything else (`system`, rate limits) is the CLI
 *  talking about itself. */
const FOLDED = new Set([...RUN, 'library_error', 'citations', 'suggestions']);

export class Session {
	/** One per run, in order: plain objects, so a host may spread one to add
	 *  its own `artefact`. */
	turns = $state<Turn[]>([]);
	/** Bumped on every applied event — see `Transcript.version`. */
	version = $state(0);
	#folds: FoldState[] = [];
	// A plain Set, as `Transcript`'s fold map is: nothing renders it.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#seen = new Set<string>();
	/** The last `uuid` in stream order, folded or skipped. */
	#after = '';

	/** The last run has started and not settled. A run the reader stopped
	 *  never settles, so a host ANDs this with its own "the stream is open". */
	get working(): boolean {
		const last = this.turns.at(-1);
		return last !== undefined && last.outcome === null;
	}

	apply(event: AgentEvent): void {
		const key = event.uuid ?? `${this.#after}|${JSON.stringify(event)}`;
		if (event.uuid) this.#after = event.uuid;
		if (this.#seen.has(key)) return;
		this.#seen.add(key);
		if (event.type === 'user' && event.isReplay) {
			this.#open(event.uuid ?? `turn-${this.turns.length}`, said(event), stamp(event));
			this.version += 1;
			return;
		}
		if (!FOLDED.has(event.type)) return;
		// A user frame that is neither a replayed message nor a tool's result is
		// the CLI nudging its own model (`isSynthetic`: "[structured-output-
		// enforce] You MUST call the StructuredOutput tool…"): neither side of
		// the conversation.
		if (event.type === 'user' && !contentOf(event).some((b) => b.type === 'tool_result')) return;

		// Settled by its own `result`. A stream that broke mid-run is not: the
		// run goes on, and a watch opened again folds the rest onto it.
		const last = this.turns.at(-1);
		const settled = last?.outcome != null && !last.outcome.unreachable;
		// The watch broke while nothing was running, and no run failed.
		if (event.type === 'library_error' && settled) return;
		// A run whose prompt was never echoed — a session started without the
		// replay flag, or one that failed before it said anything — still has
		// an answer to show; its question is simply not on the wire.
		if (!last || (settled && RUN.has(event.type))) {
			this.#open(`turn-${this.turns.length}`, '', undefined);
		} else if (last.outcome?.unreachable && RUN.has(event.type)) {
			// The stream came back and the run is still going.
			last.outcome = null;
		}
		fold(this.turns[this.turns.length - 1], this.#folds[this.#folds.length - 1], event);
		this.version += 1;
	}

	#open(id: string, question: string, at: number | undefined): void {
		this.turns.push({
			id,
			question,
			at,
			blocks: [],
			outcome: null,
			citations: [],
			suggestions: []
		});
		this.#folds.push(foldState());
	}
}

/** The words of a replayed frame: a bare string, or its text blocks. */
function said(event: AgentEvent): string {
	const content = typeof event.message === 'object' ? event.message.content : undefined;
	if (typeof content === 'string') return content;
	return contentOf(event)
		.filter((block) => block.type === 'text' && typeof block.text === 'string')
		.map((block) => block.text as string)
		.join('\n\n');
}

/** When the CLI consumed the frame, which is when this run began. */
function stamp(event: AgentEvent): number | undefined {
	const at = event.timestamp ? Date.parse(event.timestamp) : NaN;
	return Number.isNaN(at) ? undefined : at;
}
