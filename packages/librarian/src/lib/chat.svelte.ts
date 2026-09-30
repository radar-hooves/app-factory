/**
 * The page's controller: one conversation with one agent, over a room's routes
 * or a job's watch, message and stop.
 *
 * A room is asked. Each question streams its own turn, the agent names the
 * conversation on its `init` event, and the conversation is read back whole
 * when it is reopened. The turn belongs to the server, not the page: a
 * refresh, a locked phone or a closed tab leaves it running, so a reopened
 * conversation whose answer is still being written shows that, with its
 * clock, and is read again once it settles. Stop is a request to the server
 * for the same reason, never just a closed connection.
 *
 * A job is watched. Somebody else started it; the reader follows it from its
 * first event, says things to it while it works, and stops it. Its stream is
 * folded by `Session`, and a stream that closes is opened again when the
 * reader sends a message, or while the host says the job may carry on.
 *
 * Nothing here knows a URL. The transport is the host's own client over the
 * routes, and its shapes are the routes' own bodies, so a stamped app passes
 * what its client returns straight through.
 */

import { untrack } from 'svelte';
import { isQueued, type AgentEvent } from './client';
import type { Citation } from './citations';
import { Session } from './session.svelte';
import { fold, foldState, type Turn } from './transcript.svelte';

/** One conversation in the list. */
export interface ConversationSummary {
	/** The agent's own session id: what resumes it, what names it in the address. */
	id: string;
	title: string;
	/** ISO 8601. */
	last_activity_at: string;
	/** ISO 8601 while an answer is being written; null once it settles, or once
	 *  the worker writing it is gone. */
	answering_since?: string | null;
}

/** One question and its answer, as the agent's transcript keeps them. */
export interface StoredTurn {
	/** As the reader asked it, never with a preamble. */
	question: string;
	answer: string;
	/** ISO 8601, when it was asked. */
	at?: string | null;
	citations?: Citation[];
}

/** A conversation reopened. */
export interface ConversationRead extends ConversationSummary {
	turns: StoredTurn[];
}

/** Today's fair-use allowance. */
export interface Quota {
	/** 0: no limit. */
	limit: number;
	remaining: number;
	/** Nothing is counted for this person, and nothing is shown. */
	exempt: boolean;
	reached: boolean;
	/** ISO 8601. */
	resets_at: string;
	support_url?: string | null;
}

/** A reader's verdict on one answer; each one replaces the last. */
export interface Verdict {
	helpful: boolean;
	note?: string | null;
}

export interface AskRequest {
	question: string;
	files: File[];
	/** The conversation this carries on; null starts one. */
	resume: string | null;
	signal: AbortSignal;
}

/**
 * A room's routes, as the host's own client reaches them. Every method but
 * `ask` may reject; the controller says what failed.
 */
export interface RoomTransport {
	/** `POST rooms/{room}/ask`: `client.ask()` over it, which never throws. A
	 *  refusal arrives as `library_error` with its `status`: 429 is a spent
	 *  allowance, 409 a conversation already being answered. */
	ask(request: AskRequest): AsyncIterable<AgentEvent>;
	/** `GET conversations/{id}`. */
	read(id: string): Promise<ConversationRead>;
	/** `POST conversations/{id}/stop`. */
	stop(id: string): Promise<void>;
	/** `GET quota`. */
	quota(): Promise<Quota>;
	/** This person's conversations in this room. */
	list(): Promise<ConversationSummary[]>;
	/** `PATCH conversations/{id}`. */
	rename(id: string, title: string): Promise<void>;
	/** `DELETE conversations/{id}`. */
	remove(id: string): Promise<void>;
	/** `GET conversations/{id}/export`: the file, and the name to save it as. */
	download(id: string): Promise<{ name: string; body: Blob }>;
	/** The answer mark, where the agent takes one. `turn` is the answer's
	 *  zero-based position in the conversation. */
	mark?(id: string, turn: number, verdict: Verdict): Promise<void>;
}

/** A job's routes. */
export interface JobTransport {
	/** `GET …/jobs/{id}/watch`: `client.watch()` over it, which never throws. */
	watch(id: string, signal: AbortSignal): AsyncIterable<AgentEvent>;
	/** `POST …/jobs/{id}/message`: onto the run while it works, a new run once
	 *  it has settled. */
	message(id: string, text: string): Promise<void>;
	/** `POST …/jobs/{id}/stop`. */
	stop(id: string): Promise<void>;
	/** The job may carry on by itself after its stream closes (a pipeline
	 *  still on it), so the stream is watched again. Absent, it is watched
	 *  again only when the reader sends a message. */
	carriesOn?(): boolean;
}

export interface ChatOptions {
	/** How often a conversation answering out of sight is read again. */
	pollMs?: number;
	/** How often a closed job is asked whether it carries on. */
	rewatchMs?: number;
}

/** The events of a run: the agent has the question. */
const RUN = new Set(['stream_event', 'assistant', 'user', 'result']);

let minted = 0;

export class Chat {
	/** The words in the box and the files with them: bind the composer here,
	 *  so a question the server refuses comes back exactly as typed. */
	draft = $state('');
	files = $state<File[]>([]);
	/** When an answer this page is not streaming began, epoch ms: a
	 *  conversation reopened mid-answer. */
	answering = $state<number | null>(null);
	/** The agent is answering somebody else's question first. */
	waiting = $state(false);
	/** Today's allowance; null until read, and in a job. */
	quota = $state<Quota | null>(null);
	/** The open conversation, or the job; null for a new one. The host keeps
	 *  it in the address. */
	conversationId = $state<string | null>(null);
	/** This person's conversations, as `list()` last read them; null until then. */
	conversations = $state<ConversationSummary[] | null>(null);
	listFailed = $state(false);

	#room: RoomTransport | null = null;
	#job: JobTransport | null = null;
	#pollMs: number;
	#rewatchMs: number;

	#turns = $state<Turn[]>([]);
	#version = $state(0);
	#running = $state(false);
	#session = $state<Session | null>(null);
	#watching = $state(false);

	/** Which conversation the page shows, advanced whenever it leaves one: a
	 *  stream still arriving for the one it left must not write into this one. */
	#generation = 0;
	#stream: { controller: AbortController; stopWanted: boolean } | null = null;
	#poll: ReturnType<typeof setTimeout> | undefined;
	#watch: AbortController | null = null;
	#woken = false;
	#wake: (() => void) | null = null;
	// Plain, as `Session`'s seen-set: nothing renders it.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#held = new Set<string>();

	constructor(transport: RoomTransport | JobTransport, options: ChatOptions = {}) {
		if ('watch' in transport) this.#job = transport;
		else this.#room = transport;
		this.#pollMs = options.pollMs ?? 5000;
		this.#rewatchMs = options.rewatchMs ?? 2000;
	}

	/** Every turn, in order. A live one grows in place; key on `version`. */
	get turns(): Turn[] {
		return this.#session?.turns ?? this.#turns;
	}

	/** Bumped on every event folded, for `Conversation`'s follow-scroll. */
	get version(): number {
		return this.#version + (this.#session?.version ?? 0);
	}

	/** This page is streaming an answer. */
	get running(): boolean {
		if (this.#job) return this.#watching && (this.#session?.working ?? false);
		return this.#running;
	}

	/** Something is being answered, here or out of sight: the composer waits
	 *  and offers Stop. */
	get busy(): boolean {
		return this.running || this.answering !== null;
	}

	/** A job reads what the reader says while it works; a room waits for its answer. */
	get sendWhileRunning(): boolean {
		return this.#job !== null;
	}

	/** Reopen a conversation, or start watching a job. False when it could not
	 *  be read, which leaves the page on a new conversation.
	 *
	 *  Safe to call from an effect that follows the page's address: nothing
	 *  it reads of its own becomes that effect's to follow. */
	open(id: string): Promise<boolean> {
		return untrack(() => this.#open(id));
	}

	async #open(id: string): Promise<boolean> {
		this.#leave();
		this.conversationId = id;
		if (this.#job) {
			this.#follow(id);
			return true;
		}
		this.#turns = [];
		this.#held.clear();
		void this.refreshQuota();
		const mine = this.#generation;
		try {
			const read = await this.#room!.read(id);
			if (mine === this.#generation) this.#show(read, mine);
			return mine === this.#generation;
		} catch {
			if (mine === this.#generation) this.conversationId = null;
			return false;
		}
	}

	/** Back to a new conversation. A turn still being answered goes on without
	 *  the page, and is there when its conversation is reopened. Safe to call
	 *  from an effect, as `open` is. */
	new(): void {
		untrack(() => {
			this.#leave();
			this.conversationId = null;
			this.#turns = [];
			this.#held.clear();
			this.#session = null;
			this.files = [];
			this.#version += 1;
			void this.refreshQuota();
		});
	}

	/**
	 * Ask `question`, or what is in the box. Resolves once the turn settles:
	 * true if it was asked, false if it was refused, here or by the server, in
	 * which case typed words go back into the box.
	 */
	async ask(question?: string): Promise<boolean> {
		const typed = question === undefined;
		const text = (question ?? this.draft).trim();
		if (!text) return false;
		if (this.#job) return this.#message(text, typed);
		if (this.busy || this.quota?.reached) return false;
		const files = typed ? this.files : [];
		if (typed) {
			this.draft = '';
			this.files = [];
		}
		return this.#ask(text, files, typed);
	}

	/** The last question again, as a new turn: the conversation is append-only,
	 *  because the agent's transcript is. */
	again(): Promise<boolean> {
		const last = this.turns.at(-1)?.question;
		return last ? this.ask(last) : Promise.resolve(false);
	}

	/** Stop the answer being written, wherever it is being written. */
	async stop(): Promise<void> {
		const id = this.conversationId;
		if (this.#job) {
			if (id) await this.#job.stop(id).catch(() => undefined);
			return;
		}
		const stream = this.#stream;
		if (stream && this.#running) {
			this.#running = false;
			this.waiting = false;
			// Before the agent has named a new conversation there is nothing to
			// address a stop to: the stream is read on, unseen, until it does.
			if (!id) {
				stream.stopWanted = true;
				return;
			}
			stream.controller.abort();
			await this.#room!.stop(id).catch(() => undefined);
			return;
		}
		if (this.answering !== null && id) {
			await this.#room!.stop(id).catch(() => undefined);
			clearTimeout(this.#poll);
			await this.#settle(id, this.#generation);
		}
	}

	/** Read today's allowance again. One that cannot be read is left as it was. */
	async refreshQuota(): Promise<void> {
		if (!this.#room) return;
		try {
			this.quota = await this.#room.quota();
		} catch {
			// A counter that cannot be read costs the counter, never the ask.
		}
	}

	/** Read this person's conversations. Read again after every answer once
	 *  read at all, so the list follows what they ask. */
	async list(): Promise<boolean> {
		if (!this.#room) return false;
		try {
			this.conversations = await this.#room.list();
			this.listFailed = false;
			return true;
		} catch {
			this.listFailed = true;
			return false;
		}
	}

	async rename(id: string, title: string): Promise<boolean> {
		const name = title.trim();
		if (!name || !this.#room) return false;
		try {
			await this.#room.rename(id, name);
		} catch {
			return false;
		}
		const row = this.conversations?.find((c) => c.id === id);
		if (row) row.title = name;
		return true;
	}

	/** Forget a conversation everywhere. The open one, forgotten, leaves a new one. */
	async remove(id: string): Promise<boolean> {
		if (!this.#room) return false;
		try {
			await this.#room.remove(id);
		} catch {
			return false;
		}
		const at = this.conversations?.findIndex((c) => c.id === id) ?? -1;
		if (at >= 0) this.conversations?.splice(at, 1);
		if (this.conversationId === id) this.new();
		return true;
	}

	/** Save a conversation as the file the server names. Fetched rather than
	 *  navigated to, so one deleted a moment ago elsewhere is a false here,
	 *  not the reader's page replaced by an error body. */
	async download(id: string): Promise<boolean> {
		if (!this.#room) return false;
		try {
			const { name, body } = await this.#room.download(id);
			save(body, name);
			return true;
		} catch {
			return false;
		}
	}

	/** Mark an answer the agent holds. False when it could not be recorded. */
	async mark(turn: Turn, verdict: Verdict): Promise<boolean> {
		const id = this.conversationId;
		if (!id || !this.#room?.mark || !this.#held.has(turn.id)) return false;
		const position = this.turns.filter((t) => this.#held.has(t.id)).findIndex((t) => t.id === turn.id);
		try {
			await this.#room.mark(id, position, verdict);
			return true;
		} catch {
			return false;
		}
	}

	#leave(): void {
		this.#generation += 1;
		// A stop still waiting to be addressed is carried on the stream it
		// waits on, so leaving does not lose it.
		if (this.#stream && !this.#stream.stopWanted) this.#stream.controller.abort();
		this.#stream = null;
		clearTimeout(this.#poll);
		this.#watch?.abort();
		this.#watch = null;
		this.#watching = false;
		this.#running = false;
		this.answering = null;
		this.waiting = false;
	}

	async #ask(text: string, files: File[], typed: boolean): Promise<boolean> {
		const room = this.#room!;
		const mine = this.#generation;
		const stream = { controller: new AbortController(), stopWanted: false };
		this.#stream = stream;
		this.#turns.push({
			id: `asked-${(minted += 1)}`,
			question: text,
			at: Date.now(),
			blocks: [],
			outcome: null,
			citations: [],
			suggestions: []
		});
		const live = this.#turns[this.#turns.length - 1];
		const state = foldState();
		this.#running = true;
		this.waiting = false;
		this.#version += 1;
		const current = () => mine === this.#generation && this.#stream === stream;

		let ending: 'refused' | 'answering' | 'dropped' | null = null;
		for await (const event of room.ask({
			question: text,
			files,
			resume: this.conversationId,
			signal: stream.controller.signal
		})) {
			const named = event.type === 'system' && event.subtype === 'init' ? event.session_id : undefined;
			if (stream.stopWanted) {
				if (!named) continue;
				// The agent took the question as it named the conversation.
				if (current()) {
					this.conversationId = named;
					this.#held.add(live.id);
				}
				stream.controller.abort();
				await room.stop(named).catch(() => undefined);
				break;
			}
			if (!current()) break;
			if (isQueued(event)) {
				this.waiting = true;
				this.#version += 1;
				continue;
			}
			// Waiting ends when the agent starts, and no other frame says so.
			if (named || RUN.has(event.type)) this.waiting = false;
			if (named) {
				this.conversationId = named;
				this.#held.add(live.id);
				continue;
			}
			if (event.type === 'library_error' && event.status === 429) ending = 'refused';
			else if (event.type === 'library_error' && event.status === 409) ending = 'answering';
			else if (event.type === 'library_error' && event.dropped && this.conversationId)
				ending = 'dropped';
			if (ending) break;
			if (RUN.has(event.type)) this.#held.add(live.id);
			fold(live, state, event);
			this.#version += 1;
		}

		// Left for another conversation, or stopped and asked again: that one
		// owns the page now.
		if (!current()) return true;
		const id = this.conversationId;

		if (ending === 'refused' || ending === 'answering') {
			const at = this.#turns.findIndex((t) => t.id === live.id);
			if (at >= 0) this.#turns.splice(at, 1);
			if (typed) {
				this.draft = text;
				this.files = files;
			}
			this.#finish();
			// Asked elsewhere and still being answered: show that instead.
			if (ending === 'answering' && id) await this.#settle(id, mine);
			return false;
		}

		if (ending === 'dropped' && id) {
			// The page lost the stream, not the turn: read where it has got to.
			try {
				const read = await room.read(id);
				if (current()) this.#show(read, mine);
			} catch {
				if (current()) fold(live, state, { type: 'library_error' });
			}
		}
		this.#finish();
		return true;
	}

	/** A turn this page streamed has settled, one way or another. */
	#finish(): void {
		this.#stream = null;
		this.#running = false;
		this.waiting = false;
		this.#version += 1;
		void this.refreshQuota();
		if (this.conversations !== null) void this.list();
	}

	/** A conversation as read. One still being answered shows the question in
	 *  flight with nothing of its answer, which is not written yet, and is
	 *  read again until it settles. */
	#show(read: ConversationRead, mine: number): void {
		clearTimeout(this.#poll);
		const turns = read.turns.map((stored, index) => storedTurn(read.id, index, stored));
		this.#held = new Set(turns.map((t) => t.id));
		const since = epoch(read.answering_since);
		if (since !== null) {
			const last = read.turns.at(-1);
			const asked = epoch(last?.at);
			// The agent writes the question into its transcript as it takes it,
			// so a question asked since the stamp is the one in flight. One still
			// waiting for the agent is not there yet.
			const inFlight = last && (asked !== null ? asked >= since : !last.answer.trim());
			if (inFlight) Object.assign(turns[turns.length - 1], { blocks: [], citations: [] });
			else turns.push({ id: `${read.id}:${turns.length}`, question: '', blocks: [], outcome: null });
			this.#poll = setTimeout(() => void this.#settle(read.id, mine), this.#pollMs);
		}
		this.answering = since;
		this.#turns = turns;
		this.#version += 1;
	}

	/** Read a conversation answering out of sight again; once it has settled,
	 *  the allowance and the list have moved too. */
	async #settle(id: string, mine: number): Promise<void> {
		clearTimeout(this.#poll);
		try {
			const read = await this.#room!.read(id);
			if (mine !== this.#generation) return;
			this.#show(read, mine);
			if (this.answering === null) {
				void this.refreshQuota();
				if (this.conversations !== null) void this.list();
			}
		} catch {
			if (mine === this.#generation) {
				this.#poll = setTimeout(() => void this.#settle(id, mine), this.#pollMs);
			}
		}
	}

	#follow(id: string): void {
		const controller = new AbortController();
		this.#watch = controller;
		this.#session = new Session();
		void this.#watchJob(id, this.#session, controller.signal);
	}

	/** Follow a job's stream, and follow it again whenever it may have more:
	 *  a replay folds only what is new. */
	async #watchJob(id: string, session: Session, signal: AbortSignal): Promise<void> {
		const job = this.#job!;
		while (!signal.aborted) {
			this.#woken = false;
			this.#watching = true;
			try {
				for await (const event of job.watch(id, signal)) {
					if (isQueued(event)) {
						this.waiting = true;
						continue;
					}
					if (RUN.has(event.type)) this.waiting = false;
					session.apply(event);
				}
			} catch {
				// A transport that threw has closed its stream, as one that ended.
			}
			if (signal.aborted) return;
			this.#watching = false;
			this.waiting = false;
			await this.#idle(signal);
		}
	}

	/** Until the reader says something, or the job says it carries on. */
	async #idle(signal: AbortSignal): Promise<void> {
		const job = this.#job!;
		while (!signal.aborted && !this.#woken) {
			await new Promise<void>((resolve) => {
				const done = () => {
					clearTimeout(timer);
					signal.removeEventListener('abort', done);
					this.#wake = null;
					resolve();
				};
				const timer = job.carriesOn ? setTimeout(done, this.#rewatchMs) : undefined;
				this.#wake = done;
				signal.addEventListener('abort', done, { once: true });
			});
			if (job.carriesOn?.()) return;
		}
	}

	async #message(text: string, typed: boolean): Promise<boolean> {
		const id = this.conversationId;
		if (!id) return false;
		if (typed) this.draft = '';
		try {
			await this.#job!.message(id, text);
		} catch {
			if (typed) this.draft = text;
			return false;
		}
		// A settled job takes it as a new run, already started when the
		// message is accepted: its stream is watched again now.
		this.#woken = true;
		this.#wake?.();
		return true;
	}
}

function storedTurn(conversation: string, index: number, stored: StoredTurn): Turn {
	return {
		id: `${conversation}:${index}`,
		question: stored.question,
		at: epoch(stored.at) ?? undefined,
		blocks: stored.answer ? [{ kind: 'text', index: 0, text: stored.answer }] : [],
		outcome: null,
		citations: stored.citations ?? []
	};
}

function epoch(value: string | null | undefined): number | null {
	const at = value ? Date.parse(value) : NaN;
	return Number.isNaN(at) ? null : at;
}

function save(body: Blob, name: string): void {
	const url = URL.createObjectURL(body);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	URL.revokeObjectURL(url);
}
