/**
 * Streams captured from the real CLI (Claude Code 2.1.283, `--output-format
 * stream-json --verbose`), never written by hand:
 *
 * - `job-stream` — an app-started session: `--input-format stream-json
 *   --replay-user-messages`, no partial messages, the prompt and a second
 *   message on stdin, then a third run under `--resume`.
 * - `chat-stream` — one question with `--include-partial-messages`, the
 *   shape an ask route forwards.
 * - `parallel-reads` — two Read calls in one message.
 * - `schema-session` — godswood's recording (radar-hooves/godswood#839) of an
 *   app-started session under `--json-schema` and `--replay-user-messages`,
 *   stored as the factory stores it: two runs, each handing in its answer
 *   through the CLI's own `StructuredOutput` call, the second after prose
 *   and a synthetic `[structured-output-enforce]` user frame.
 *
 * Sanitised and nothing more: hook and rate-limit frames dropped, the init
 * frame cut to the fields a fold reads, the capture folder rewritten to
 * `/srv/job`, and an image's bytes emptied the way the factory stores them.
 */
/// <reference types="vite/client" />
import type { AgentEvent } from '$lib/client';
import job from './job-stream.jsonl?raw';
import chat from './chat-stream.jsonl?raw';
import parallel from './parallel-reads.jsonl?raw';
import schema from './schema-session.jsonl?raw';

const STREAMS = {
	'job-stream': job,
	'chat-stream': chat,
	'parallel-reads': parallel,
	'schema-session': schema
};

export function captured(name: keyof typeof STREAMS): AgentEvent[] {
	return STREAMS[name]
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as AgentEvent);
}
