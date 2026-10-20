/**
 * Turns of a tool-armed persona, in the frames the stamped backend streams:
 * Claude Code's events and the app's `citations` and `artefact` frames. Built
 * to the backend's wire contract, not captured from a run, so each carries only
 * what a fold reads.
 */
import type { AgentEvent } from '$lib/client';

const SESSION = 'c0ffee00-0000-4000-8000-000000000001';

const init: AgentEvent = { type: 'system', subtype: 'init', session_id: SESSION, model: 'sonnet' };
const done: AgentEvent = { type: 'result', is_error: false, num_turns: 3, duration_ms: 4200 };

const assistant = (...content: Array<Record<string, unknown>>): AgentEvent => ({
	type: 'assistant',
	message: { content }
});
const use = (id: string, name: string, input: Record<string, unknown>) => ({
	type: 'tool_use',
	id,
	name,
	input
});
const said = (id: string, content: string, is_error = false): AgentEvent => ({
	type: 'user',
	message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] }
});
const text = (body: string) => ({ type: 'text', text: body });

export const LIBRARY_SEARCH: AgentEvent[] = [
	init,
	assistant(use('t1', 'mcp__library__search', { query: 'recreation leave' })),
	said('t1', '{"hits":[{"document_id":7,"title":"Leave manual"}]}'),
	{ type: 'citations', items: [{ n: 1, document_id: '7', title: 'Leave manual' }] },
	assistant(text('A permanent member accrues 20 days a year [1].')),
	done
];

export const WEB_TURN: AgentEvent[] = [
	init,
	assistant(use('w1', 'mcp__supacrawl__supacrawl_search', { query: 'ADF pay rise 2026' })),
	said(
		'w1',
		JSON.stringify({
			results: [
				{ title: 'Pay rise announced', url: 'https://www.defence.gov.au/news/pay-rise' },
				{ title: 'Allowances', url: 'https://example.org/allowances#top' }
			]
		})
	),
	assistant(use('w2', 'mcp__supacrawl__supacrawl_scrape', { url: 'https://example.org/allowances' })),
	said('w2', JSON.stringify({ title: 'Allowances', markdown: '# Allowances' })),
	assistant(
		text(
			'The rise is 4% ([Defence](https://www.defence.gov.au/news/pay-rise)); see also [the wiki](https://en.wikipedia.org/wiki/Pay).'
		)
	),
	done
];

export const THINKING_TURN: AgentEvent[] = [
	init,
	assistant({ type: 'thinking', thinking: 'The clause is in section 4.' }),
	assistant(use('k1', 'Read', { file_path: '/chat/leave.md' })),
	said('k1', 'Leave accrues at 20 days.'),
	assistant(text('Twenty days.')),
	done
];

export const WRITE_TURN: AgentEvent[] = [
	init,
	assistant(use('f1', 'Write', { file_path: '/chat/brief.md', content: '# Brief' })),
	said('f1', 'File created'),
	{
		type: 'artefact',
		name: 'brief.md',
		version: 1,
		media_type: 'text/markdown',
		bytes: 7,
		formats: ['docx', 'pdf'],
		title: 'Brief: leave',
		kind: 'minute',
		changes: null,
		pages: 1
	},
	assistant(use('f2', 'Edit', { file_path: '/chat/brief.md', old_string: 'Brief', new_string: 'Briefing' })),
	said('f2', 'Edited'),
	{
		type: 'artefact',
		name: 'brief.md',
		version: 2,
		media_type: 'text/markdown',
		bytes: 11,
		formats: ['docx', 'pdf'],
		title: 'Brief: leave',
		kind: 'minute',
		changes: 'through your CO',
		pages: 1
	},
	assistant(text('Written to brief.md.')),
	done
];
