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

const STREAMS = { 'job-stream': job, 'chat-stream': chat, 'parallel-reads': parallel };

export function captured(name: keyof typeof STREAMS): AgentEvent[] {
	return STREAMS[name]
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as AgentEvent);
}
