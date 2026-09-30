/**
 * The page's controller, against a fake of the routes it will be given.
 *
 * The routes do not exist yet (the factory's rooms slice is the next step), so
 * the fake is the contract: what an ask streams is the real CLI's captured
 * stream, and every refusal arrives the way `client.ask()` reports one — as a
 * `library_error` carrying its status, or saying the stream dropped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	Chat,
	type AskRequest,
	type ConversationRead,
	type JobTransport,
	type Quota,
	type RoomTransport
} from '$lib/chat.svelte';
import type { AgentEvent } from '$lib/client';
import type { TextBlock } from '$lib/transcript.svelte';
import { captured } from './fixtures/captured';

const CHAT = captured('chat-stream');
const SESSION = CHAT[0].session_id as string;
const ANSWER = CHAT.at(-1)?.result as string;

/** A stream the test feeds by hand, which ends when the reader aborts it
 *  exactly as `client.ask()` does: quietly. */
class Pipe implements AsyncIterable<AgentEvent> {
	#queue: AgentEvent[] = [];
	#done = false;
	#wake: (() => void) | null = null;

	constructor(signal?: AbortSignal) {
		signal?.addEventListener('abort', () => {
			this.#queue = [];
			this.end();
		});
	}

	push(...events: AgentEvent[]): void {
		this.#queue.push(...events);
		this.#wake?.();
	}

	end(): void {
		this.#done = true;
		this.#wake?.();
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
		for (;;) {
			const next = this.#queue.shift();
			if (next) {
				yield next;
				continue;
			}
			if (this.#done) return;
			await new Promise<void>((resolve) => (this.#wake = resolve));
		}
	}
}

const QUOTA: Quota = {
	limit: 40,
	remaining: 39,
	exempt: false,
	reached: false,
	resets_at: '2026-10-01T00:00:00+10:00'
};

function conversation(overrides: Partial<ConversationRead> = {}): ConversationRead {
	return {
		id: SESSION,
		title: 'Receipt total',
		last_activity_at: '2026-09-30T02:00:00Z',
		answering_since: null,
		turns: [{ question: 'What is the total?', answer: ANSWER, at: '2026-09-30T01:59:00Z' }],
		...overrides
	};
}

/** The routes, faked. Each ask gets a `Pipe` the test drives. */
function room(overrides: Partial<RoomTransport> = {}) {
	const asks: Array<{ request: AskRequest; pipe: Pipe }> = [];
	const transport: RoomTransport = {
		ask: (request) => {
			const pipe = new Pipe(request.signal);
			asks.push({ request, pipe });
			return pipe;
		},
		read: vi.fn(async () => conversation()),
		stop: vi.fn(async () => undefined),
		quota: vi.fn(async () => QUOTA),
		list: vi.fn(async () => []),
		rename: vi.fn(async () => undefined),
		remove: vi.fn(async () => undefined),
		download: vi.fn(async () => ({ name: 'receipt.md', body: new Blob(['#']) })),
		mark: vi.fn(async () => undefined),
		...overrides
	};
	return { transport, asks };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const prose = (chat: Chat, index = -1) =>
	(chat.turns.at(index)?.blocks ?? [])
		.filter((b): b is TextBlock => b.kind === 'text')
		.map((b) => b.text)
		.join('');

let made: Chat[] = [];
function chat(transport: RoomTransport | JobTransport, pollMs = 5) {
	const next = new Chat(transport, { pollMs, rewatchMs: 5 });
	made.push(next);
	return next;
}

afterEach(() => {
	// Leave every conversation, so no poll outlives its test.
	for (const each of made) each.new();
	made = [];
});

describe('Chat asking', () => {
	it('streams a question into a turn and takes the conversation the agent names', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		c.draft = 'What is the total?';
		const asked = c.ask();

		expect(c.draft).toBe('');
		expect(c.running).toBe(true);
		expect(c.turns).toHaveLength(1);
		expect(asks[0].request).toMatchObject({ question: 'What is the total?', resume: null });

		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		expect(await asked).toBe(true);

		expect(c.running).toBe(false);
		expect(c.conversationId).toBe(SESSION);
		expect(prose(c)).toContain(ANSWER);
		expect(c.turns[0].outcome).toMatchObject({ isError: false });
		expect(transport.quota).toHaveBeenCalled();
	});

	it('carries the conversation on with the next question', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		const first = c.ask('What is the total?');
		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		await first;

		const second = c.ask('And the tax?');
		expect(asks[1].request.resume).toBe(SESSION);
		asks[1].pipe.end();
		await second;
	});

	it('refuses to ask over an answer still being written', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		void c.ask('first');
		expect(await c.ask('second')).toBe(false);
		expect(asks).toHaveLength(1);
		asks[0].pipe.end();
	});

	it('asks the last question again as a new turn, and nothing typed goes with it', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		const first = c.ask('What is the total?');
		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		await first;

		c.draft = 'half a thought';
		const again = c.again();
		expect(asks[1].request).toMatchObject({ question: 'What is the total?', resume: SESSION });
		expect(asks[1].request.files).toEqual([]);
		expect(c.draft).toBe('half a thought');
		asks[1].pipe.push(...CHAT);
		asks[1].pipe.end();
		expect(await again).toBe(true);
		expect(c.turns.map((t) => t.question)).toEqual(['What is the total?', 'What is the total?']);
	});
});

describe('Chat kinds of turn', () => {
	const briefing = { title: 'Briefing', isAnswer: true };
	const artefact = (kind: string) => (kind === 'briefing' ? briefing : undefined);

	it('asks a kind of turn, cards it as the host says, and asks it again as the same kind', async () => {
		const { transport, asks } = room();
		const c = new Chat(transport, { pollMs: 5, artefact });
		made.push(c);
		const asked = c.ask('Write a briefing on the Manual.', 'briefing');
		expect(asks[0].request.kind).toBe('briefing');
		expect(c.turns[0]).toMatchObject({ kind: 'briefing', artefact: briefing });
		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		await asked;

		const again = c.again();
		expect(asks[1].request.kind).toBe('briefing');
		asks[1].pipe.end();
		await again;

		const plain = c.ask('And leave?');
		expect(asks[2].request.kind).toBeUndefined();
		expect(c.turns.at(-1)?.artefact).toBeUndefined();
		asks[2].pipe.end();
		await plain;
	});

	it('cards a turn read back by the kind the server kept', async () => {
		const { transport } = room({
			read: vi.fn(async () =>
				conversation({
					turns: [
						{ question: 'What is the total?', answer: ANSWER, at: null },
						{ question: 'Brief me.', answer: '# Briefing', at: null, kind: 'briefing' }
					]
				})
			)
		});
		const c = new Chat(transport, { pollMs: 5, artefact });
		made.push(c);
		await c.open(SESSION);
		expect(c.turns.map((t) => [t.kind, t.artefact])).toEqual([
			[undefined, undefined],
			['briefing', briefing]
		]);
	});
});

describe('Chat depth of a question', () => {
	it('asks at a depth, keeps it on the turn, and asks again at the same depth', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		const asked = c.ask('Can a reservist claim recreation leave?', undefined, 'thorough');
		expect(asks[0].request.depth).toBe('thorough');
		expect(c.turns[0]).toMatchObject({ depth: 'thorough' });
		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		await asked;

		const again = c.again();
		expect(asks[1].request.depth).toBe('thorough');
		asks[1].pipe.end();
		await again;

		const plain = c.ask('And the tax?');
		expect(asks[2].request.depth).toBeUndefined();
		expect(c.turns.at(-1)?.depth).toBeUndefined();
		asks[2].pipe.end();
		await plain;
	});

	it('reads a stored depth back onto the turn', async () => {
		const { transport } = room({
			read: vi.fn(async () =>
				conversation({
					turns: [
						{ question: 'What is the total?', answer: ANSWER, at: null, depth: 'quick' },
						{ question: 'Interpret the clause.', answer: '# Answer', at: null, depth: 'thorough' }
					]
				})
			)
		});
		const c = chat(transport);
		await c.open(SESSION);
		expect(c.turns.map((t) => t.depth)).toEqual(['quick', 'thorough']);
	});
});

describe('Chat waiting', () => {
	it('says the question waits while the stream says so, and stops once the agent starts', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		const asked = c.ask('What is the total?');
		// The library's own frames, as `api/librarian/session.py` sends them.
		asks[0].pipe.push({
			type: 'queued',
			message: 'another question is being answered; waiting for it to finish'
		});
		await tick();
		expect(c.waiting).toBe(true);
		// Repeated at least every 30 s; none of it lands on the turn, and a frame
		// that is not the agent starting does not end the wait.
		asks[0].pipe.push(
			{
				type: 'queued',
				message: 'another question is being answered; still waiting for it to finish'
			},
			{ type: 'system', subtype: 'status' }
		);
		await tick();
		expect(c.waiting).toBe(true);
		expect(c.turns[0].blocks).toEqual([]);

		asks[0].pipe.push(...CHAT.slice(0, 3));
		await tick();
		expect(c.waiting).toBe(false);
		expect(c.running).toBe(true);

		asks[0].pipe.push(...CHAT.slice(3));
		asks[0].pipe.end();
		await asked;
		expect(prose(c)).toContain(ANSWER);
	});
});

describe('Chat stopping', () => {
	it('stops a named conversation by asking the server, not just by hanging up', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		const asked = c.ask('What is the total?');
		asks[0].pipe.push(...CHAT.slice(0, 6));
		await tick();

		await c.stop();
		expect(transport.stop).toHaveBeenCalledWith(SESSION);
		expect(c.running).toBe(false);
		expect(asks[0].request.signal.aborted).toBe(true);
		expect(await asked).toBe(true);
		// What it had said stays; nothing claims it finished.
		expect(c.turns[0].outcome).toBeNull();
	});

	it('stops a new conversation the moment the agent names it', async () => {
		// Pressed while the question waits: there is nothing to address a stop
		// to until the agent starts, so the stream is read on, unseen, until then.
		const { transport, asks } = room();
		const c = chat(transport);
		const asked = c.ask('What is the total?');
		// Its type alone says it waits.
		asks[0].pipe.push({ type: 'queued' });
		await tick();

		await c.stop();
		expect(c.running).toBe(false);
		expect(c.waiting).toBe(false);
		expect(transport.stop).not.toHaveBeenCalled();

		asks[0].pipe.push(...CHAT.slice(0, 4));
		await asked;
		expect(transport.stop).toHaveBeenCalledWith(SESSION);
		expect(c.conversationId).toBe(SESSION);
		expect(prose(c)).toBe('');

		// The agent took that question as it named the conversation, so the
		// next answer is the second one it holds.
		const next = c.ask('What is the total?');
		expect(asks[1].request.resume).toBe(SESSION);
		asks[1].pipe.push(...CHAT);
		asks[1].pipe.end();
		await next;
		expect(await c.mark(c.turns[1], { helpful: true })).toBe(true);
		expect(transport.mark).toHaveBeenCalledWith(SESSION, 1, { helpful: true });
	});

	it('stops an answer being written out of sight, and reads it once it has', async () => {
		const read = vi
			.fn<RoomTransport['read']>()
			.mockResolvedValueOnce(conversation({ answering_since: '2026-09-30T01:58:00Z' }))
			.mockResolvedValue(conversation());
		const { transport } = room({ read });
		const c = chat(transport, 60_000);
		await c.open(SESSION);
		expect(c.answering).not.toBeNull();
		expect(c.busy).toBe(true);

		await c.stop();
		expect(transport.stop).toHaveBeenCalledWith(SESSION);
		expect(c.answering).toBeNull();
		expect(prose(c)).toBe(ANSWER);
	});
});

describe('Chat reopening', () => {
	it('reopens a conversation as the turns the agent kept', async () => {
		const { transport } = room();
		const c = chat(transport);
		expect(await c.open(SESSION)).toBe(true);
		expect(c.conversationId).toBe(SESSION);
		expect(c.turns.map((t) => t.question)).toEqual(['What is the total?']);
		expect(prose(c)).toBe(ANSWER);
		expect(c.turns[0].at).toBe(Date.parse('2026-09-30T01:59:00Z'));
		// Read back, not watched: nothing may claim it cited nothing.
		expect(c.turns[0].outcome).toBeNull();
		expect(c.busy).toBe(false);
	});

	it('shows an answer still being written, with its question, then reads it again once it settles', async () => {
		const since = '2026-09-30T02:05:00Z';
		const inFlight = conversation({
			answering_since: since,
			turns: [
				...conversation().turns,
				{ question: 'And the tax?', answer: 'Let me look at the', at: '2026-09-30T02:05:01Z' }
			]
		});
		const settled = conversation({
			turns: [...conversation().turns, { question: 'And the tax?', answer: 'Fifty cents.' }]
		});
		const read = vi
			.fn<RoomTransport['read']>()
			.mockResolvedValueOnce(inFlight)
			.mockResolvedValueOnce(inFlight)
			.mockResolvedValue(settled);
		const { transport } = room({ read });
		const c = chat(transport);

		await c.open(SESSION);
		expect(c.answering).toBe(Date.parse(since));
		expect(c.busy).toBe(true);
		expect(c.turns.map((t) => t.question)).toEqual(['What is the total?', 'And the tax?']);
		// Half an answer is not shown as though it were the answer.
		expect(c.turns[1].blocks).toEqual([]);
		expect(await c.ask('Something else')).toBe(false);

		await vi.waitFor(() => expect(c.answering).toBeNull());
		expect(read).toHaveBeenCalledTimes(3);
		expect(prose(c)).toBe('Fifty cents.');
		expect(c.busy).toBe(false);
	});

	it('shows a question still waiting for the agent as an answer on its way', async () => {
		// Queued, the question is not in the agent's transcript yet.
		const { transport } = room({
			read: vi.fn(async () => conversation({ answering_since: '2026-09-30T02:05:00Z' }))
		});
		const c = chat(transport, 60_000);
		await c.open(SESSION);
		expect(c.turns).toHaveLength(2);
		expect(c.turns[0].blocks).not.toEqual([]);
		expect(c.turns[1]).toMatchObject({ question: '', blocks: [] });
	});

	it('leaves the page on a new conversation when one cannot be read', async () => {
		const { transport } = room({ read: vi.fn(async () => Promise.reject(new Error('404'))) });
		const c = chat(transport);
		expect(await c.open('gone')).toBe(false);
		expect(c.conversationId).toBeNull();
		expect(c.turns).toEqual([]);
	});

	it('writes nothing from a stream into a conversation opened after it', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		const asked = c.ask('What is the total?');
		await c.open('another');
		expect(asks[0].request.signal.aborted).toBe(true);
		asks[0].pipe.push(...CHAT);
		await asked;
		expect(c.conversationId).toBe('another');
		expect(c.turns.map((t) => t.question)).toEqual(['What is the total?']);
		expect(c.running).toBe(false);
	});

	it('reads where the answer has got to when the stream drops under it', async () => {
		// A locked phone: the connection dies and the turn goes on without it.
		const { transport, asks } = room({
			read: vi.fn(async () => conversation({ answering_since: '2026-09-30T01:58:00Z' }))
		});
		const c = chat(transport, 60_000);
		const asked = c.ask('What is the total?');
		asks[0].pipe.push(...CHAT.slice(0, 6), { type: 'library_error', dropped: true });
		asks[0].pipe.end();
		await asked;
		expect(transport.read).toHaveBeenCalledWith(SESSION);
		expect(c.running).toBe(false);
		expect(c.answering).toBe(Date.parse('2026-09-30T01:58:00Z'));
		expect(c.turns.at(-1)?.outcome).toBeNull();
	});

	it("says the agent can't be reached when a dropped stream cannot be read either", async () => {
		const { transport, asks } = room({ read: vi.fn(async () => Promise.reject(new Error())) });
		const c = chat(transport);
		const asked = c.ask('What is the total?');
		asks[0].pipe.push(...CHAT.slice(0, 6), { type: 'library_error', dropped: true });
		asks[0].pipe.end();
		await asked;
		expect(c.turns.at(-1)?.outcome).toMatchObject({ unreachable: true });
	});
});

describe('Chat allowance', () => {
	it('asks nothing once the allowance is spent', async () => {
		const { transport, asks } = room({
			quota: vi.fn(async () => ({ ...QUOTA, remaining: 0, reached: true }))
		});
		const c = chat(transport);
		await c.refreshQuota();
		c.draft = 'What is the total?';
		expect(await c.ask()).toBe(false);
		expect(asks).toHaveLength(0);
		expect(c.draft).toBe('What is the total?');
	});

	it('puts the words in the box again when the server says the allowance is spent', async () => {
		const quota = vi
			.fn<RoomTransport['quota']>()
			.mockResolvedValue({ ...QUOTA, remaining: 0, reached: true });
		const { transport, asks } = room({ quota });
		const c = chat(transport);
		const file = new File(['x'], 'receipt.pdf');
		c.draft = 'What is the total?';
		c.files = [file];
		const asked = c.ask();
		expect(c.draft).toBe('');

		asks[0].pipe.push({ type: 'library_error', status: 429 });
		asks[0].pipe.end();
		expect(await asked).toBe(false);
		expect(c.turns).toEqual([]);
		expect(c.draft).toBe('What is the total?');
		expect(c.files).toEqual([file]);
		await vi.waitFor(() => expect(c.quota?.reached).toBe(true));
	});

	it('shows the conversation still answering when another device is already asking it', async () => {
		const { transport, asks } = room({
			read: vi.fn(async () => conversation({ answering_since: '2026-09-30T01:58:00Z' }))
		});
		const c = chat(transport, 60_000);
		await c.open(SESSION);
		// Settled on this page a moment ago, and not yet on the other device.
		c.answering = null;
		c.draft = 'And the tax?';
		const asked = c.ask();
		asks[0].pipe.push({ type: 'library_error', status: 409 });
		asks[0].pipe.end();
		expect(await asked).toBe(false);
		expect(c.draft).toBe('And the tax?');
		expect(c.answering).not.toBeNull();
	});
});

describe('Chat conversations', () => {
	it('lists, renames and deletes, and a deleted open conversation leaves a new one', async () => {
		const { transport } = room({
			list: vi.fn(async () => [conversation(), { ...conversation(), id: 'b', title: 'Other' }])
		});
		const c = chat(transport);
		await c.open(SESSION);
		expect(await c.list()).toBe(true);
		expect(c.conversations).toHaveLength(2);

		expect(await c.rename('b', '  Leave  ')).toBe(true);
		expect(transport.rename).toHaveBeenCalledWith('b', 'Leave');
		expect(c.conversations?.find((x) => x.id === 'b')?.title).toBe('Leave');

		expect(await c.remove(SESSION)).toBe(true);
		expect(c.conversations?.map((x) => x.id)).toEqual(['b']);
		expect(c.conversationId).toBeNull();
		expect(c.turns).toEqual([]);
	});

	it('reads the list again once an answer settles', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		await c.list();
		const asked = c.ask('What is the total?');
		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		await asked;
		await vi.waitFor(() => expect(transport.list).toHaveBeenCalledTimes(2));
	});

	it('says so when an act fails, and changes nothing', async () => {
		const { transport } = room({
			list: vi.fn(async () => [conversation()]),
			rename: vi.fn(async () => Promise.reject(new Error())),
			remove: vi.fn(async () => Promise.reject(new Error())),
			download: vi.fn(async () => Promise.reject(new Error()))
		});
		const c = chat(transport);
		await c.list();
		expect(await c.rename(SESSION, 'New')).toBe(false);
		expect(await c.remove(SESSION)).toBe(false);
		expect(await c.download(SESSION)).toBe(false);
		expect(c.conversations?.[0].title).toBe('Receipt total');
	});

	it('saves a download under the name the server gave it', async () => {
		const { transport } = room();
		const c = chat(transport);
		const revoked = vi.fn();
		Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: revoked });
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		expect(await c.download(SESSION)).toBe(true);
		expect(click).toHaveBeenCalledOnce();
		expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('receipt.md');
		expect(revoked).toHaveBeenCalledWith('blob:x');
		click.mockRestore();
	});
});

describe('Chat marks', () => {
	it('addresses an answer by its place among the answers the agent holds', async () => {
		const { transport, asks } = room();
		const c = chat(transport);
		await c.open(SESSION);

		// A question that never reached the agent is on screen and not in its transcript.
		const lost = c.ask('Lost?');
		asks[0].pipe.push({ type: 'library_error' });
		asks[0].pipe.end();
		await lost;

		const asked = c.ask('And the tax?');
		asks[1].pipe.push(...CHAT);
		asks[1].pipe.end();
		await asked;

		const last = c.turns.at(-1)!;
		expect(await c.mark(last, { helpful: true, note: 'Spot on' })).toBe(true);
		expect(transport.mark).toHaveBeenCalledWith(SESSION, 1, { helpful: true, note: 'Spot on' });
		expect(await c.mark(c.turns[1], { helpful: false })).toBe(false);
	});

	it('records nothing where the agent takes no mark', async () => {
		const { transport } = room({ mark: undefined });
		const c = chat(transport);
		await c.open(SESSION);
		expect(await c.mark(c.turns[0], { helpful: true })).toBe(false);
	});
});

describe('Chat shares', () => {
	it('shares an answer by its place, keeps where it is read, and stops sharing it', async () => {
		const share = vi.fn(async (_id: string, turn: number, on: boolean) =>
			on ? `/rooms/r/answers/${SESSION}/${turn}` : null
		);
		const { transport, asks } = room({ share });
		const c = chat(transport);
		await c.open(SESSION);
		const asked = c.ask('And the tax?');
		asks[0].pipe.push(...CHAT);
		asks[0].pipe.end();
		await asked;

		const last = c.turns.at(-1)!;
		expect(await c.share(last, true)).toBe(true);
		expect(share).toHaveBeenLastCalledWith(SESSION, 1, true);
		expect(last.shared).toBe(`/rooms/r/answers/${SESSION}/1`);
		expect(await c.share(last, false)).toBe(true);
		expect(last.shared).toBeUndefined();
	});

	it('reads back which answers are shared', async () => {
		const read = vi.fn(async () =>
			conversation({
				turns: [{ question: 'Total?', answer: ANSWER, shared: `/rooms/r/answers/${SESSION}/0` }]
			})
		);
		const c = chat(room({ read }).transport);
		await c.open(SESSION);
		expect(c.turns[0].shared).toBe(`/rooms/r/answers/${SESSION}/0`);
	});

	it('says so when a share is refused, and shares nothing where the room takes none', async () => {
		const refusing = room({ share: vi.fn(async () => Promise.reject(new Error('HTTP 404'))) });
		const c = chat(refusing.transport);
		await c.open(SESSION);
		expect(await c.share(c.turns[0], true)).toBe(false);
		expect(c.turns[0].shared).toBeUndefined();

		const none = chat(room().transport);
		await none.open(SESSION);
		expect(await none.share(none.turns[0], true)).toBe(false);
	});
});

describe('Chat over a job', () => {
	function job(streams: AgentEvent[][], carriesOn?: () => boolean) {
		const watched: string[] = [];
		const transport: JobTransport = {
			watch: (id, signal) => {
				watched.push(id);
				const pipe = new Pipe(signal);
				pipe.push(...(streams.shift() ?? []));
				pipe.end();
				return pipe;
			},
			message: vi.fn(async () => undefined),
			stop: vi.fn(async () => undefined),
			...(carriesOn ? { carriesOn } : {})
		};
		return { transport, watched };
	}

	const JOB = captured('job-stream');
	const firstRun = JOB.findIndex((e) => e.type === 'result') + 1;

	it('folds the job it watches into turns, and says things to it while it works', async () => {
		const { transport } = job([JOB.slice(0, firstRun)]);
		const c = chat(transport);
		expect(c.sendWhileRunning).toBe(true);
		await c.open('job-1');
		await vi.waitFor(() => expect(c.turns).toHaveLength(1));
		expect(c.turns[0].outcome).not.toBeNull();

		c.draft = 'Which line is the largest?';
		expect(await c.ask()).toBe(true);
		expect(transport.message).toHaveBeenCalledWith('job-1', 'Which line is the largest?');
		expect(c.draft).toBe('');

		await c.stop();
		expect(transport.stop).toHaveBeenCalledWith('job-1');
		expect(c.quota).toBeNull();
	});

	it('watches a settled job again when a message starts its next run, folding only what is new', async () => {
		const { transport, watched } = job([JOB.slice(0, firstRun), JOB]);
		const c = chat(transport);
		await c.open('job-1');
		await vi.waitFor(() => expect(c.turns).toHaveLength(1));
		await c.ask('Which line is the largest?');
		await vi.waitFor(() => expect(c.turns).toHaveLength(3));
		expect(watched).toEqual(['job-1', 'job-1']);
	});

	it('watches again while the host says the job carries on', async () => {
		const { transport, watched } = job([JOB.slice(0, firstRun), JOB], () => true);
		const c = chat(transport);
		await c.open('job-1');
		await vi.waitFor(() => expect(c.turns).toHaveLength(3));
		expect(watched.length).toBeGreaterThanOrEqual(2);
	});

	it('keeps the words in the box when a message is refused', async () => {
		const { transport } = job([]);
		transport.message = vi.fn(async () => Promise.reject(new Error('stopping')));
		const c = chat(transport);
		await c.open('job-1');
		c.draft = 'Skip the voided line.';
		expect(await c.ask()).toBe(false);
		expect(c.draft).toBe('Skip the voided line.');
	});
});
