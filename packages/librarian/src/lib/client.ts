/**
 * The agent stream.
 *
 * Deliberately thin: it frames SSE and hands back Claude Code's OWN events,
 * unaltered. There is no mapping onto a house vocabulary here or anywhere
 * else — the backend forwards what the CLI emits and this forwards what the
 * backend sent, so the Console renders the real thing and a new Claude Code
 * event type needs no change on either side.
 */

/** One Claude Code stream event. Typed only where we branch on it. */
export interface AgentEvent {
	type: string;
	subtype?: string;
	event?: {
		type: string;
		index?: number;
		delta?: { type: string; text?: string; thinking?: string; partial_json?: string };
		content_block?: { type: string; name?: string; id?: string };
	};
	message?: { content?: Array<Record<string, unknown>> };
	session_id?: string;
	result?: string;
	num_turns?: number;
	total_cost_usd?: number;
	duration_ms?: number;
	is_error?: boolean;
	error?: string;
	detail?: string;
	tools?: string[];
	model?: string;
	[key: string]: unknown;
}

export interface AskOptions {
	question: string;
	resume?: string | null;
	subtree?: string;
	/** Collections this question may see. Empty means all of them. */
	collections?: string[];
	signal?: AbortSignal;
	/** Where the ask lands. Each app mounts its own ask route. */
	endpoint?: string;
	/** Override for the ambient `fetch`, e.g. a caller-authenticated wrapper. */
	fetch?: typeof fetch;
}

/** Async-iterate the events of one question. */
export async function* ask(options: AskOptions): AsyncGenerator<AgentEvent> {
	const doFetch = options.fetch ?? fetch;
	const response = await doFetch(options.endpoint ?? '/api/agent/ask', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({
			question: options.question,
			resume: options.resume ?? null,
			subtree: options.subtree ?? '',
			collections: options.collections ?? []
		}),
		signal: options.signal
	});

	if (!response.ok || !response.body) {
		yield { type: 'library_error', error: `The agent answered ${response.status}.` };
		return;
	}

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	// Frames are separated by a blank line and split across network reads at
	// arbitrary points, so the tail of each read is carried rather than parsed.
	let buffered = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffered += value;
		let boundary = buffered.indexOf('\n\n');
		while (boundary !== -1) {
			const frame = buffered.slice(0, boundary);
			buffered = buffered.slice(boundary + 2);
			boundary = buffered.indexOf('\n\n');
			// `data:` only — the type lives inside the payload where Claude Code
			// puts it, so there is no second place to look.
			const data = frame
				.split('\n')
				.filter((l) => l.startsWith('data:'))
				.map((l) => l.slice(5).trim())
				.join('');
			if (!data) continue;
			try {
				yield JSON.parse(data) as AgentEvent;
			} catch {
				/* a partial frame at end of stream is not an error */
			}
		}
	}
}
