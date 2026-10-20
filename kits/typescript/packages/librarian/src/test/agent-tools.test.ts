/**
 * A persona armed with tools: each step its own row, the web apart from the
 * library, the documents it writes, and a reopened turn that looks like the
 * live one.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
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

/** The turn's steps open behind one line; every test that reads a row opens it. */
async function unfold() {
	for (const head of document.querySelectorAll('.ds-lib-steps-head')) await fireEvent.click(head);
}

const rows = () =>
	[...document.querySelectorAll('.ds-lib-tool-row, .ds-lib-thinking-row')].map((b) =>
		b.textContent?.replace(/\s+/g, ' ').trim()
	);

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
	it('folds the search behind one line, its row counting what it found, with the sources folded beside it', async () => {
		const t = live(LIBRARY_SEARCH);
		render(AgentTranscript, { props: props(t) });

		expect(rows()).toEqual([]);
		expect(screen.getByRole('button', { name: /^Searched the library.*1 step$/ })).toBeInTheDocument();
		await unfold();
		expect(rows()).toEqual(['Searched the library for recreation leave 1 found']);
		await fireEvent.click(screen.getByRole('button', { name: /Searched the library for/ }));
		expect(document.body.textContent).toContain('"query": "recreation leave"');
		expect(document.body.textContent).toContain('Leave manual');

		await fireEvent.click(screen.getByRole('button', { name: /^1 source$/ }));
		expect(screen.getByRole('heading', { name: 'From the library' })).toBeInTheDocument();
		expect(screen.queryByText('From the web')).not.toBeInTheDocument();
	});
});

describe('web sources', () => {
	const t = live(WEB_TURN);
	const answer = (t.blocks.at(-1) as { text: string }).text;

	it('come from the pages read and the answer’s links, once each, never a search result left unread', () => {
		expect(webSources(t.blocks, answer)).toEqual([
			{
				url: 'https://example.org/allowances',
				title: 'Allowances',
				host: 'example.org',
				read: true
			},
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

	it('fold into a count, numbered on from the library, opening in a new tab', async () => {
		render(AgentTranscript, { props: props(t) });

		await fireEvent.click(screen.getByRole('button', { name: /^3 sources$/ }));
		expect(screen.getByRole('heading', { name: 'From the web' })).toBeInTheDocument();
		const link = screen
			.getAllByRole('link', { name: /Defence/ })
			.find((a) => a.textContent?.includes('defence.gov.au'));
		expect(link).toHaveAttribute('href', 'https://www.defence.gov.au/news/pay-rise');
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		expect(link?.textContent).toMatch(/^\s*2\s*Defence/);
		expect(link).toHaveTextContent('defence.gov.au');
		expect(screen.queryByText('From the library')).not.toBeInTheDocument();
	});

	it('count the library’s first, and a link in the answer reads as the next number’s chip', async () => {
		const events: AgentEvent[] = [
			...LIBRARY_SEARCH.slice(0, 4),
			{
				type: 'assistant',
				message: {
					content: [
						{
							type: 'text',
							text: 'Leave is 20 days [1], and pay rose ([Defence](https://www.defence.gov.au/news/pay-rise)).'
						}
					]
				}
			},
			LIBRARY_SEARCH[5]
		];
		const mixed = live(events);
		const { container } = render(AgentTranscript, { props: props(mixed) });

		await fireEvent.click(screen.getByRole('button', { name: /^2 sources/ }));
		expect(screen.getByText('1 library · 1 web')).toBeInTheDocument();
		const chip = await waitFor(() => {
			const found = container.querySelector('sup[data-web]');
			expect(found).not.toBeNull();
			return found as HTMLElement;
		});
		expect(chip).toHaveTextContent('2');
		expect(chip.dataset.web).toBe('https://www.defence.gov.au/news/pay-rise');
		// The link's words stay, no longer a link: the chip is how a page opens.
		expect(container.querySelector('.agent-prose a')).toBeNull();
		expect(container.querySelector('.agent-prose')).toHaveTextContent('pay rose (Defence2)');
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		await fireEvent.click(chip);
		expect(open).toHaveBeenCalledWith(chip.dataset.web, '_blank', 'noopener,noreferrer');
		open.mockRestore();
		expect(screen.getByText('1 library · 1 web')).toBeInTheDocument();
	});

	it('say when a page was read, today for a turn asked today', async () => {
		render(AgentTranscript, { props: props(t, { at: Date.now() }) });
		await fireEvent.click(screen.getByRole('button', { name: /^3 sources$/ }));
		expect(document.body.textContent).toContain('example.org · read today');
		expect(document.body.textContent).not.toContain('en.wikipedia.org · read');
	});

	it('wait until the answer has settled', () => {
		render(AgentTranscript, { props: props(t, { running: true }) });
		expect(screen.queryByRole('button', { name: /sources/ })).not.toBeInTheDocument();
	});
});

describe('a thinking block', () => {
	const t = live(THINKING_TURN);

	it('is a folded row, "Thought" once done, opening on its text', async () => {
		render(AgentTranscript, { props: props(t) });

		await unfold();
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
		expect(screen.getAllByRole('button', { name: 'Thinking…' })).not.toHaveLength(0);
	});

	it('says how long it ran once it closes, measured on this page', async () => {
		vi.useFakeTimers();
		try {
			const timed = new Transcript();
			timed.apply({ type: 'stream_event', event: { type: 'message_start' } });
			timed.apply({
				type: 'stream_event',
				event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }
			});
			timed.apply({
				type: 'stream_event',
				event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm' } }
			});
			vi.advanceTimersByTime(8200);
			timed.apply({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
			timed.apply({
				type: 'stream_event',
				event: { type: 'content_block_start', index: 1, content_block: { type: 'text' } }
			});
			timed.apply({
				type: 'stream_event',
				event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Done.' } }
			});
			render(AgentTranscript, { props: props(timed) });
			await unfold();
			expect(rows()).toEqual(['Thought for 8s']);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('a document the persona wrote', () => {
	const t = live(WRITE_TURN);

	it('folds each artefact frame into the turn, in order, with its title, kind, changes and pages', () => {
		expect(
			t.written.map((w) => [w.name, w.version, w.media_type, w.formats, w.title, w.kind, w.changes, w.pages])
		).toEqual([
			['brief.md', 1, 'text/markdown', ['docx', 'pdf'], 'Brief: leave', 'minute', null, 1],
			['brief.md', 2, 'text/markdown', ['docx', 'pdf'], 'Brief: leave', 'minute', 'through your CO', 1]
		]);
		const into = { blocks: [], outcome: null } as Parameters<typeof fold>[0];
		fold(into, foldState(), WRITE_TURN[3]);
		expect(into.written).toHaveLength(1);
	});

	it('cards the newest version with its kind, pages and version, Open, and a Word chip', async () => {
		const opened: number[] = [];
		render(AgentTranscript, {
			props: props(t, {
				onopenwritten: (w: { version: number }) => opened.push(w.version),
				writtenUrl: (name: string, version: number, format: string) =>
					`/artefact?name=${name}&version=${version}&format=${format}`
			})
		});

		await unfold();
		expect(rows()).toContain('Wrote brief.md');
		expect(screen.getByText('Brief: leave')).toBeInTheDocument();
		expect(screen.getByText('Minute · 1 page · v2')).toBeInTheDocument();
		expect(screen.queryByText('Minute · 1 page · v1')).not.toBeInTheDocument();
		const chip = screen.getByRole('link', { name: /brief\.docx/ });
		expect(chip).toHaveAttribute('href', '/artefact?name=brief.md&version=2&format=docx');
		expect(chip).toHaveAttribute('download', 'brief.docx');
		expect(chip).toHaveTextContent('Word · v2');
		expect(chip).toHaveTextContent('Download');

		await fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		expect(opened).toEqual([2]);
	});

	it('offers the source as written where there is no Word copy', () => {
		const html = {
			name: 'site/page.html',
			version: 1,
			media_type: 'text/html',
			formats: [],
			title: 'A page',
			kind: null,
			changes: null,
			pages: 0
		};
		render(AgentTranscript, {
			props: props({ blocks: [] , written: [html] }, { writtenUrl: () => '/x' })
		});
		expect(screen.getByText('Document · v1')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /page\.html/ })).toHaveTextContent('HTML · v1');
	});
});

describe('a turn read back', () => {
	const stored = storedTurn('c1', 0, {
		question: 'What is in the brief?',
		answer: 'Written to brief.md.',
		files: ['scan.pdf'],
		artefacts: [
			{
				name: 'brief.md',
				version: 1,
				media_type: 'text/markdown',
				formats: ['pdf'],
				title: 'Brief',
				kind: null,
				changes: null,
				pages: 0
			}
		],
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

	it('renders the rows, the attachment and the card the live turn had', async () => {
		render(AgentTranscript, {
			props: { ...props(stored), question: stored.question, files: stored.files }
		});

		await unfold();
		expect(rows()).toEqual(['Searched the library for brief', 'Wrote brief.md Failed']);
		expect(screen.getByText('scan.pdf')).toBeInTheDocument();
		expect(screen.getByText('PDF')).toBeInTheDocument();
		expect(screen.getByText('Brief')).toBeInTheDocument();
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
