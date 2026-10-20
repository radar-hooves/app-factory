/**
 * A persona armed with tools: each step its own row, the web apart from the
 * library, the documents it writes, and a reopened turn that looks like the
 * live one.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AgentTranscript from '$lib/components/agent-transcript/agent-transcript.svelte';
import { storedTurn } from '$lib/chat.svelte';
import type { AgentEvent } from '$lib/client';
import { Session } from '$lib/session.svelte';
import { describe as words, fold, foldState, Transcript, type Turn } from '$lib/transcript.svelte';
import { webSources } from '$lib/web-sources';
import { LIBRARY_SEARCH, THINKING_TURN, WEB_TURN, WRITE_TURN } from './fixtures/tool-turns';

function live(events: AgentEvent[]): Transcript {
	const transcript = new Transcript();
	for (const event of events) transcript.apply(event);
	return transcript;
}

// Named fields, not a spread: a `Transcript`'s state lives on its prototype.
const props = (
	turn: Pick<Turn, 'blocks'> & Partial<Pick<Turn, 'written' | 'citations' | 'outcome'>>,
	extra = {}
) => ({
	question: 'q',
	running: false,
	blocks: turn.blocks,
	written: turn.written,
	citations: turn.citations,
	outcome: turn.outcome ?? null,
	...extra
});

const rows = () =>
	screen
		.getAllByRole('button')
		.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
		.filter((text) => text !== 'Copy');

describe('a tool step in the persona’s words', () => {
	const tool = (name: string, input: Record<string, unknown>) =>
		words({ kind: 'tool', index: 0, name, rawInput: JSON.stringify(input) });

	it('names the library, the web and the files', () => {
		expect(tool('mcp__library__search', { query: 'leave' })).toMatchObject({
			verb: 'Searched the library for',
			object: 'leave'
		});
		expect(tool('mcp__library__document_content', { id: 1 }).verb).toBe('Read a document');
		expect(tool('mcp__library__document_detail', { id: 1 }).verb).toBe('Read a document');
		expect(tool('mcp__supacrawl__supacrawl_search', { query: 'pay' })).toMatchObject({
			verb: 'Searched the web for',
			object: 'pay'
		});
		expect(tool('mcp__supacrawl__supacrawl_scrape', { url: 'https://www.example.org/a' })).toMatchObject(
			{ verb: 'Read', object: 'example.org' }
		);
		expect(tool('Write', { file_path: '/chat/notes/brief.md' })).toMatchObject({
			verb: 'Wrote',
			object: 'brief.md'
		});
		expect(tool('Edit', { file_path: '/chat/brief.md' })).toMatchObject({
			verb: 'Edited',
			object: 'brief.md'
		});
		expect(tool('mcp__litellm__ocr', { file_path: '/chat/scan.pdf' })).toMatchObject({
			verb: 'Read the scanned pages of',
			object: 'scan.pdf'
		});
	});
});

describe('a turn with a library search', () => {
	it('shows the search as a collapsed row, with the numbered sources beside it', async () => {
		const t = live(LIBRARY_SEARCH);
		render(AgentTranscript, { props: props(t) });

		expect(rows()).toContain('Searched the library for recreation leave');
		await fireEvent.click(screen.getByRole('button', { name: /Searched the library/ }));
		expect(document.body.textContent).toContain('"query": "recreation leave"');
		expect(document.body.textContent).toContain('Leave manual');
		expect(screen.getByText('Sources')).toBeInTheDocument();
		expect(screen.queryByText('From the web')).not.toBeInTheDocument();
	});
});

describe('web sources', () => {
	const t = live(WEB_TURN);
	const answer = (t.blocks.at(-1) as { text: string }).text;

	it('come from the pages read and the answer’s links, once each, never a search result left unread', () => {
		expect(webSources(t.blocks, answer)).toEqual([
			{ url: 'https://example.org/allowances', title: 'Allowances', host: 'example.org' },
			{ url: 'https://www.defence.gov.au/news/pay-rise', title: 'Defence', host: 'defence.gov.au' },
			{ url: 'https://en.wikipedia.org/wiki/Pay', title: 'the wiki', host: 'en.wikipedia.org' }
		]);
	});

	it('read nothing from a failed call or a tool that is not the web', () => {
		const failed = live([
			WEB_TURN[0],
			WEB_TURN[1],
			{ ...WEB_TURN[2], message: { content: [{ type: 'tool_result', tool_use_id: 'w1', content: '{"url":"https://x.test"}', is_error: true }] } }
		]);
		expect(webSources(failed.blocks, 'see [a](javascript:alert(1))')).toEqual([]);
		expect(webSources(live(LIBRARY_SEARCH).blocks, '')).toEqual([]);
	});

	it('list apart from the library, unnumbered, opening in a new tab', () => {
		render(AgentTranscript, { props: props(t) });

		expect(screen.getByRole('heading', { name: 'From the web' })).toBeInTheDocument();
		// The answer links it inline too; the list's own link names its host.
		const link = screen.getAllByRole('link', { name: /Defence/ }).find((a) => a.textContent?.includes('defence.gov.au'));
		expect(link).toHaveAttribute('href', 'https://www.defence.gov.au/news/pay-rise');
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		expect(link).toHaveTextContent('defence.gov.au');
		expect(screen.queryByText('Sources')).not.toBeInTheDocument();
	});

	it('wait until the answer has settled', () => {
		render(AgentTranscript, { props: props(t, { running: true }) });
		expect(screen.queryByText('From the web')).not.toBeInTheDocument();
	});
});

describe('a thinking block', () => {
	const t = live(THINKING_TURN);

	it('is a folded row, "Thought" once done, opening on its text', async () => {
		render(AgentTranscript, { props: props(t) });

		expect(rows().slice(0, 2)).toEqual(['Thought', 'Read leave']);
		expect(screen.queryByText('The clause is in section 4.')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Thought' }));
		expect(screen.getByText('The clause is in section 4.')).toBeInTheDocument();
	});

	it('says Thinking… while it streams', () => {
		const streaming = new Transcript();
		streaming.apply(THINKING_TURN[0]);
		streaming.apply({ type: 'stream_event', event: { type: 'message_start' } });
		streaming.apply({
			type: 'stream_event',
			event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }
		});
		streaming.apply({
			type: 'stream_event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm' } }
		});
		render(AgentTranscript, { props: props(streaming, { running: true }) });
		expect(screen.getByRole('button', { name: 'Thinking…' })).toBeInTheDocument();
	});
});

describe('a document the persona wrote', () => {
	const t = live(WRITE_TURN);

	it('folds each artefact frame into the turn, in order', () => {
		expect(t.written.map((w) => [w.name, w.version, w.media_type, w.formats])).toEqual([
			['brief.md', 1, 'text/markdown', ['docx', 'pdf']],
			['brief.md', 2, 'text/markdown', ['docx', 'pdf']]
		]);
		const into = { blocks: [], outcome: null } as Parameters<typeof fold>[0];
		fold(into, foldState(), WRITE_TURN[3]);
		expect(into.written).toHaveLength(1);
	});

	it('cards every version with Open and a download for the source and each format', async () => {
		const opened: number[] = [];
		render(AgentTranscript, {
			props: props(t, {
				onopenwritten: (w: { version: number }) => opened.push(w.version),
				writtenUrl: (name: string, version: number, format: string) =>
					`/artefact?name=${name}&version=${version}&format=${format}`
			})
		});

		expect(rows()).toContain('Wrote brief.md');
		expect(screen.getByText('Version 1')).toBeInTheDocument();
		expect(screen.getByText('Version 2')).toBeInTheDocument();
		const [first] = screen.getAllByRole('link', { name: 'Markdown' });
		expect(first).toHaveAttribute('href', '/artefact?name=brief.md&version=1&format=source');
		expect(screen.getAllByRole('link', { name: 'Word' })[1]).toHaveAttribute(
			'href',
			'/artefact?name=brief.md&version=2&format=docx'
		);
		expect(screen.getAllByRole('link', { name: 'PDF' })).toHaveLength(2);

		await fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[1]);
		expect(opened).toEqual([2]);
	});
});

describe('a turn read back', () => {
	const stored = storedTurn('c1', 0, {
		question: 'What is in the brief?',
		answer: 'Written to brief.md.',
		files: ['scan.pdf'],
		artefacts: [{ name: 'brief.md', version: 1, media_type: 'text/markdown', formats: ['pdf'] }],
		steps: [
			{
				id: 's1',
				name: 'mcp__library__search',
				input: { query: 'brief' },
				result: 'nothing held',
				is_error: false
			},
			{ id: 's2', name: 'Write', input: { file_path: '/chat/brief.md' }, result: 'denied', is_error: true }
		]
	});

	it('rebuilds each step as a tool block before the answer', () => {
		expect(stored.blocks.map((b) => b.kind)).toEqual(['tool', 'tool', 'text']);
		expect(stored.blocks[0]).toMatchObject({ id: 's1', result: 'nothing held', isError: false });
		expect(stored.files).toEqual(['scan.pdf']);
		expect(stored.written).toHaveLength(1);
	});

	it('renders the rows, the chips and the cards the live turn had', () => {
		render(AgentTranscript, {
			props: { ...props(stored), question: stored.question, files: stored.files }
		});

		expect(rows()).toEqual([
			'Searched the library for brief',
			'Wrote brief.md Failed'
		]);
		expect(screen.getByText('scan.pdf')).toBeInTheDocument();
		expect(screen.getByText('Version 1')).toBeInTheDocument();
	});

	it('is plain text for a turn stored before steps existed', () => {
		const old = storedTurn('c1', 1, { question: 'q', answer: 'a' });
		expect(old.blocks).toEqual([{ kind: 'text', index: 0, text: 'a' }]);
		expect(old.files).toEqual([]);
	});
});

describe('the sent question', () => {
	it('shows a chip for each file that went with it', () => {
		render(AgentTranscript, { props: { ...props({ blocks: [] }), question: 'Read these', files: ['a.pdf', 'b.docx'] } });
		expect(screen.getByText('a.pdf')).toBeInTheDocument();
		expect(screen.getByText('b.docx')).toBeInTheDocument();
	});

	it('is edited in place, and Send hands the new words to the host', async () => {
		const sent: string[] = [];
		render(AgentTranscript, {
			props: {
				...props({ blocks: [] }),
				question: 'First words',
				files: ['a.pdf'],
				onedit: async (text: string) => (sent.push(text), true)
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		const box = screen.getByRole('textbox', { name: 'Edit' });
		expect(box).toHaveValue('First words');
		expect(screen.getByText(/not sent again/)).toBeInTheDocument();
		await fireEvent.input(box, { target: { value: 'Better words' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

		expect(sent).toEqual(['Better words']);
	});

	it('goes back to the bubble on Cancel, and offers no edit while a turn runs', async () => {
		const { unmount } = render(AgentTranscript, {
			props: { ...props({ blocks: [] }), question: 'First words', onedit: async () => true }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.getByText('First words')).toBeInTheDocument();
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
		unmount();

		render(AgentTranscript, {
			props: { ...props({ blocks: [] }), question: 'q', running: true, onedit: async () => true }
		});
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});
});

describe('a job’s session', () => {
	it('folds the same tool rows without grouping them', () => {
		const session = new Session();
		for (const event of THINKING_TURN) session.apply(event);
		expect(session.turns.at(-1)?.blocks.map((b) => b.kind)).toContain('tool');
	});
});
