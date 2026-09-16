/**
 * The agent stream.
 *
 * Deliberately thin: it frames SSE and hands back Claude Code's OWN events,
 * unaltered. There is no mapping onto a house vocabulary here or anywhere
 * else — the backend forwards what the CLI emits and this forwards what the
 * backend sent, so the Console renders the real thing and a new Claude Code
 * event type needs no change on either side.
 */

import type { Citation } from './citations';

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
	/**
	 * The payload of the library's own two trailing frames, which share a key
	 * and not a shape: `citations` carries sources, `suggestions` carries
	 * follow-up questions as plain strings. Narrowed on `type` by whoever
	 * reads it (`Transcript.apply`).
	 */
	items?: Citation[] | string[];
	[key: string]: unknown;
}

export interface AskOptions {
	question: string;
	resume?: string | null;
	subtree?: string;
	/** Collections this question may see. Empty means all of them. */
	collections?: string[];
	/** Files Milton reads for this question. Switches the request to multipart. */
	files?: File[];
	/** What kind of turn this ask should become. Absent means an ordinary
	 *  question; a host that offers a study artefact sends its own kind
	 *  (`'briefing'`) and interprets what comes back accordingly — the wire
	 *  vocabulary is the host's own, never a fixed set here. */
	kind?: string;
	signal?: AbortSignal;
	/** Where the ask lands. Each app mounts its own ask route. */
	endpoint?: string;
	/** Override for the ambient `fetch`, e.g. a caller-authenticated wrapper. */
	fetch?: typeof fetch;
}

/**
 * The request body for one ask.
 *
 * JSON when there are no files, multipart when there are — one endpoint, two
 * encodings, because a `File` cannot cross a JSON body and base64 would double
 * a 20 MB attachment on the wire for nothing. The multipart field names are
 * the form convention (`collections[]`, `files[]`) rather than the JSON keys.
 *
 * `Content-Type` is deliberately absent for multipart: setting it by hand
 * omits the boundary the browser generates, and the server then reads zero
 * fields from a body that is on the wire perfectly.
 */
function requestInit(options: AskOptions, signal?: AbortSignal): RequestInit {
	if (!options.files?.length) {
		return {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				question: options.question,
				resume: options.resume ?? null,
				subtree: options.subtree ?? '',
				collections: options.collections ?? [],
				kind: options.kind
			}),
			signal
		};
	}

	const form = new FormData();
	form.append('question', options.question);
	if (options.resume) form.append('resume', options.resume);
	for (const collection of options.collections ?? []) form.append('collections[]', collection);
	for (const file of options.files) form.append('files[]', file, file.name);
	if (options.kind) form.append('kind', options.kind);
	return { method: 'POST', credentials: 'include', body: form, signal };
}

/**
 * Async-iterate the events of one question.
 *
 * It never throws. Every way a stream can fail to open or die half-way through
 * — the network dropping, an expired session redirecting the POST to an
 * identity provider the browser then blocks on CORS, a server closing the
 * connection mid-answer — comes back as one `library_error` event and a
 * finished iteration, because a host's loop is what re-enables its Send
 * button. A thrown generator leaves that loop unfinished: Pebblestone's
 * console sat with Send disabled and no message on screen, indefinitely,
 * every time a session expired mid-conversation.
 *
 * The event carries no words. The words name a persona and this layer has no
 * idea which one is speaking, so `copyFor(name).unreachable` supplies them
 * where the turn is rendered.
 */
export async function* ask(options: AskOptions): AsyncGenerator<AgentEvent> {
	const doFetch = options.fetch ?? fetch;
	let response: Response;
	try {
		response = await doFetch(
			options.endpoint ?? '/api/agent/ask',
			requestInit(options, options.signal)
		);
	} catch {
		// A reader who pressed stop asked for this one; it is not a failure.
		if (options.signal?.aborted) return;
		yield { type: 'library_error' };
		return;
	}

	// A session that expired mid-conversation is the shape this catches: the
	// POST is redirected to a login page, which answers 200 with HTML, and a
	// reader whose stream "opened" then waits for frames that can never come.
	//
	// A response that DECLARES something other than an event stream is refused;
	// one that declares nothing is read anyway. A route behind a proxy that
	// drops the header is still streaming, and refusing it here would be this
	// layer breaking a working consumer over a header — the terminal-frame
	// check at the end of this function catches it if it really says nothing.
	const kind = (response.headers.get('content-type') ?? '').toLowerCase();
	if (!response.ok || !response.body || (kind && !kind.includes('text/event-stream'))) {
		yield { type: 'library_error' };
		return;
	}

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	// Frames are separated by a blank line and split across network reads at
	// arbitrary points, so the tail of each read is carried rather than parsed.
	let buffered = '';
	// A turn that ends with no terminal frame ended by accident. Tracked here
	// rather than left to the renderer, which cannot tell a stream that died
	// from one still arriving.
	let terminal = false;

	/** One frame's `data:` lines, as the event they carry. */
	function parse(frame: string): AgentEvent | null {
		// `data:` only — the type lives inside the payload where Claude Code
		// puts it, so there is no second place to look.
		const data = frame
			.split('\n')
			.filter((l) => l.startsWith('data:'))
			.map((l) => l.slice(5).trim())
			.join('');
		if (!data) return null;
		try {
			return JSON.parse(data) as AgentEvent;
		} catch {
			// A partial frame at the end of a stream is not an error.
			return null;
		}
	}

	for (;;) {
		let chunk: ReadableStreamReadResult<string>;
		try {
			chunk = await reader.read();
		} catch {
			if (options.signal?.aborted) return;
			yield { type: 'library_error' };
			return;
		}
		if (chunk.done) break;
		buffered += chunk.value;
		let boundary = buffered.indexOf('\n\n');
		while (boundary !== -1) {
			const frame = buffered.slice(0, boundary);
			buffered = buffered.slice(boundary + 2);
			boundary = buffered.indexOf('\n\n');
			const event = parse(frame);
			if (!event) continue;
			if (event.type === 'result' || event.type === 'library_error') terminal = true;
			yield event;
		}
	}

	// The last frame of a stream that closed cleanly without its blank line.
	// It is usually the terminal `result`, carrying the duration and the
	// sources, so dropping it both loses the answer's furniture and makes a
	// finished turn look like one that died.
	const last = parse(buffered);
	if (last) {
		if (last.type === 'result' || last.type === 'library_error') terminal = true;
		yield last;
	}

	if (!terminal && !options.signal?.aborted) yield { type: 'library_error' };
}
