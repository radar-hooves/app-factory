/**
 * A document the persona wrote, in the reading column: Markdown through the
 * sanitising renderer on a paper surface, HTML only in an empty-sandbox frame,
 * every version reachable and marked against the one before, and the visuals
 * a persona's fenced blocks are drawn by.
 */
import { FRAME_CSP, framed } from '$lib/written';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ArtefactPane from '$lib/components/artefact-pane/artefact-pane.svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import Markdown from '$lib/components/markdown/markdown.svelte';
import type { Turn } from '$lib/transcript.svelte';
import type { Written } from '$lib/written';
import Visual from './fixtures/visual.svelte';

const v1: Written = {
	name: 'brief.md',
	version: 1,
	media_type: 'text/markdown',
	formats: ['pdf'],
	title: 'Brief: leave',
	kind: 'minute',
	changes: null,
	pages: 1
};
const v2: Written = { ...v1, version: 2, changes: 'through your CO, and enclosure 2' };
const page: Written = {
	name: 'site/page.html',
	version: 1,
	media_type: 'text/html',
	formats: [],
	title: 'A page',
	kind: null,
	changes: null,
	pages: 0
};

const url = (name: string, version: number, format: string) => `/a?${name}&${version}&${format}`;

describe('the pane on a written document', () => {
	it('renders HTML only inside a frame with an empty sandbox', async () => {
		const hostile = '<h1>Hi</h1><script>window.parent.hacked = 1</script>';
		const { container } = render(ArtefactPane, {
			props: {
				versions: [page],
				version: 1,
				loadWritten: async () => ({ text: hostile, mediaType: 'text/html' }),
				writtenUrl: url,
				onclose: () => {}
			}
		});

		const frame = await waitFor(() => {
			const found = container.querySelector('iframe');
			expect(found).not.toBeNull();
			return found as HTMLIFrameElement;
		});
		expect(frame.getAttribute('sandbox')).toBe('');
		const srcdoc = frame.getAttribute('srcdoc') ?? '';
		expect(
			srcdoc.startsWith('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'')
		).toBe(true);
		expect(srcdoc).toContain('<h1>');
		// Nothing of it reached the page itself.
		expect(container.querySelector('h1')).toBeNull();
		expect(container.querySelector('script')).toBeNull();
	});

	it('renders Markdown with raw HTML sanitised', async () => {
		const { container } = render(ArtefactPane, {
			props: {
				versions: [v1],
				version: 1,
				loadWritten: async () => ({
					text: '# Brief\n\n<img src=x onerror="alert(1)"><script>alert(1)</script>',
					mediaType: 'text/markdown'
				}),
				onclose: () => {}
			}
		});

		await waitFor(() => expect(screen.getByRole('heading', { name: 'Brief' })).toBeInTheDocument());
		expect(container.querySelector('iframe')).toBeNull();
		expect(container.querySelector('script')).toBeNull();
		expect(container.querySelector('[onerror]')).toBeNull();
	});

	it('opens on the newest version, switches between them, and links each download', async () => {
		const load = vi.fn(async (_name: string, version: number) => ({
			text: `Version ${version} text`,
			mediaType: 'text/markdown'
		}));
		const switched: number[] = [];
		render(ArtefactPane, {
			props: {
				versions: [v1, v2],
				loadWritten: load,
				writtenUrl: url,
				onversion: (version: number) => switched.push(version),
				onclose: () => {}
			}
		});

		await waitFor(() => expect(screen.getByText('Version 2 text')).toBeInTheDocument());
		expect(load).toHaveBeenCalledWith('brief.md', 2);
		const picker = screen.getByRole('combobox', { name: 'Version' }) as HTMLSelectElement;
		expect(picker.value).toBe('2');
		expect([...picker.options].map((o) => o.textContent)).toEqual(['v1', 'v2']);
		expect(screen.getByRole('heading', { name: 'Brief: leave' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /Download/ }));
		expect(screen.getByRole('menuitem', { name: 'Markdown' })).toHaveAttribute(
			'href',
			'/a?brief.md&2&source'
		);
		expect(screen.getByRole('menuitem', { name: 'PDF' })).toHaveAttribute(
			'href',
			'/a?brief.md&2&pdf'
		);
		// A phone's bar offers the one download directly: the source, with no Word copy.
		expect(screen.getByRole('link', { name: 'Markdown' })).toHaveAttribute(
			'href',
			'/a?brief.md&2&source'
		);

		await fireEvent.change(picker, { target: { value: '1' } });
		expect(switched).toEqual([1]);
	});

	it('says so when a version cannot be read', async () => {
		render(ArtefactPane, {
			props: {
				versions: [v1],
				loadWritten: async () => Promise.reject(new Error('gone')),
				onclose: () => {}
			}
		});
		await waitFor(() =>
			expect(screen.getByText("That document can't be opened right now.")).toBeInTheDocument()
		);
	});
});

describe('Conversation with a written document', () => {
	const turns: Turn[] = [
		{ id: '1', question: 'write it', blocks: [], outcome: null, written: [v1] },
		{ id: '2', question: 'tighten it', blocks: [], outcome: null, written: [v2] }
	];

	it('opens a card’s version in the column, with every version of that name to switch to', async () => {
		const load = vi.fn(async (_name: string, version: number) => ({
			text: `Text of ${version}`,
			mediaType: 'text/markdown'
		}));
		render(Conversation, {
			props: { turns, running: false, loadWritten: load, writtenUrl: url }
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);

		await waitFor(() => expect(screen.getByText('Text of 1')).toBeInTheDocument());
		const picker = screen.getByRole('combobox', { name: 'Version' }) as HTMLSelectElement;
		expect(picker.value).toBe('1');
		expect(picker.options).toHaveLength(2);
		expect(screen.getByRole('button', { name: 'Showing' })).toBeInTheDocument();

		await fireEvent.change(picker, { target: { value: '2' } });
		await waitFor(() => expect(screen.getByText('Text of 2')).toBeInTheDocument());
	});

	it('only links when the host cannot read a version', () => {
		render(Conversation, { props: { turns, running: false, writtenUrl: url } });
		expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('link', { name: /brief\.md/ })).toHaveLength(2);
	});
});

describe('a briefing the persona wrote as a document', () => {
	// Measured on caspo 24/10/2026: asked for a briefing, Outrider wrote it to a
	// file and answered with the sentence that says so, and the card over that
	// sentence was all the reader could open.
	const SAID = 'I have written the briefing to `brief.md`.';
	const briefing = (running: boolean): Turn => ({
		id: '1',
		question: 'Write a briefing on leave.',
		blocks: [{ kind: 'text', index: 0, text: SAID }],
		outcome: running ? null : { durationMs: 20000 },
		written: running ? [] : [v1],
		artefact: { title: 'Briefing', isAnswer: true }
	});

	it('is that document: its card, and the prose that says so, never a card over that sentence', () => {
		render(Conversation, {
			props: { turns: [briefing(false)], running: false, writtenUrl: url, loadWritten: vi.fn() }
		});
		expect(screen.getByText(/I have written the briefing/)).toBeInTheDocument();
		expect(screen.getByText('Brief: leave')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /^Briefing/ })).not.toBeInTheDocument();
	});

	it('opens the document in the column once it is written', async () => {
		const load = vi.fn(async () => ({ text: '# The briefing itself', mediaType: 'text/markdown' }));
		const { rerender } = render(Conversation, {
			props: { turns: [briefing(true)], running: true, loadWritten: load, writtenUrl: url }
		});
		await rerender({
			turns: [briefing(false)],
			running: false,
			loadWritten: load,
			writtenUrl: url
		});
		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'The briefing itself' })).toBeInTheDocument()
		);
		expect(load).toHaveBeenCalledWith('brief.md', 1);
		expect(screen.queryByRole('complementary', { name: 'Study artefact' })).not.toBeInTheDocument();
	});
});

describe('Conversation editing a question', () => {
	const turns: Turn[] = [
		{ id: '1', question: 'first', blocks: [], outcome: null },
		{ id: '2', question: 'second', blocks: [], outcome: null }
	];

	it('hands the edit the position of the question among the turns', async () => {
		const onedit = vi.fn(async () => true);
		render(Conversation, { props: { turns, running: false, onedit } });

		await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
		await fireEvent.input(screen.getByRole('textbox', { name: 'Edit' }), {
			target: { value: 'second, better' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

		expect(onedit).toHaveBeenCalledWith(1, 'second, better');
	});

	it('offers no edit while an answer is being written, or on a kind of turn', () => {
		const onedit = vi.fn(async () => true);
		const { unmount } = render(Conversation, { props: { turns, running: true, onedit } });
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		unmount();

		render(Conversation, {
			props: { turns: [{ ...turns[0], kind: 'briefing' }], running: false, onedit }
		});
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});
});

describe('the pane on a version of a document', () => {
	const sources: Record<number, string> = {
		1: '---\ntitle: Brief\n---\n# Brief\n\nFirst paragraph.\n\n1. One\n2. Two\n',
		2: '---\ntitle: Brief\n---\n# Brief\n\nFirst paragraph.\n\n1. One\n2. Two, through the CO\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n'
	};
	const load = async (_name: string, version: number) => ({
		text: sources[version],
		mediaType: 'text/markdown'
	});

	it('strips front matter, and says what kind of document it is', async () => {
		const { container } = render(ArtefactPane, {
			props: { versions: [v1], loadWritten: load, onclose: () => {} }
		});
		await waitFor(() => expect(screen.getByRole('heading', { name: 'Brief' })).toBeInTheDocument());
		expect(container.textContent).not.toContain('title: Brief');
		expect(container.querySelector('.ds-lib-pane-subtitle')).toHaveTextContent('Minute');
		expect(container.querySelector('.ds-lib-pane-paper')).not.toBeNull();
	});

	it('says what changed since the version before, and marks the blocks that did', async () => {
		const { container } = render(ArtefactPane, {
			props: { versions: [v1, v2], loadWritten: load, onclose: () => {} }
		});

		expect(
			screen.getByText('Changed since v1: through your CO, and enclosure 2')
		).toBeInTheDocument();
		await waitFor(() => expect(container.querySelector('[data-changed]')).not.toBeNull());
		const marked = [...container.querySelectorAll('[data-changed]')].map((el) =>
			el.textContent?.replace(/\s+/g, ' ').trim()
		);
		// The edited list item and the table's three new rows; the heading, the
		// paragraph and the first item are as they were.
		expect(marked).toHaveLength(4);
		expect(marked[0]).toBe('Two, through the CO');
		expect(marked.slice(2)).toEqual(['1 2', '3 4']);
	});

	it('marks nothing on the first version, and has no line for a version that says nothing changed', async () => {
		const { container } = render(ArtefactPane, {
			props: { versions: [v1], loadWritten: load, onclose: () => {} }
		});
		await waitFor(() => expect(screen.getByRole('heading', { name: 'Brief' })).toBeInTheDocument());
		expect(container.querySelector('[data-changed]')).toBeNull();
		expect(container.querySelector('.ds-lib-pane-changed')).toBeNull();
	});

	it('copies the document as shown', async () => {
		const write = vi.fn(async () => {});
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: write },
			configurable: true
		});
		render(ArtefactPane, { props: { versions: [v1], loadWritten: load, onclose: () => {} } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
		expect(write).toHaveBeenCalledWith(expect.not.stringContaining('title: Brief'));
	});
});

describe('visuals a persona’s fenced blocks are drawn by', () => {
	const visual = {
		component: Visual,
		parse: (source: string) => source.trim().split('\n')
	};
	const content = 'Before\n\n```chart\na\nb\n```\n\n```python\nprint(1)\n```\n';

	it('hands a registered language’s parsed block to its component, leaving other code as code', () => {
		const { container } = render(Markdown, { props: { content, visuals: { chart: visual } } });

		expect(screen.getByTestId('visual')).toHaveTextContent('["a","b"]');
		expect(screen.getByTestId('visual')).toHaveAttribute('data-source', 'a\nb');
		expect(container.textContent).toContain('print(1)');
		expect(container.querySelector('code.language-chart')).toBeNull();
		expect(container.querySelector('code.language-python')).not.toBeNull();
	});

	it('draws a block that is closed while the answer still streams, and a placeholder for one that is not', () => {
		const { container } = render(Markdown, {
			props: {
				content: 'Intro\n\n```chart\na\n```\n\nMid\n\n```chart\n{"half',
				streaming: true,
				copy: undefined,
				visuals: { chart: visual }
			}
		});
		expect(screen.getAllByTestId('visual')).toHaveLength(1);
		expect(screen.getByRole('status')).toHaveTextContent('Drawing…');
		expect(container.querySelector('code.language-chart')).toBeNull();
	});

	it('keeps a block still open once the answer has stopped, as the text it was', () => {
		const { container } = render(Markdown, {
			props: { content: 'Intro\n\n```chart\n{"half', visuals: { chart: visual } }
		});
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(screen.queryByTestId('visual')).not.toBeInTheDocument();
		expect(container.querySelector('code.language-chart')).toHaveTextContent('{"half');
	});

	it('shows a closed block that will not parse as its raw text, and the answer around it stays', () => {
		const { container } = render(Markdown, {
			props: {
				content: 'Before\n\n```chart\nnot json\n```\n\nAfter',
				visuals: {
					chart: {
						component: Visual,
						parse: (source: string) => JSON.parse(source)
					}
				}
			}
		});
		expect(screen.queryByTestId('visual')).not.toBeInTheDocument();
		expect(container.querySelector('code.language-chart')).toHaveTextContent('not json');
		expect(container.textContent).toContain('Before');
		expect(container.textContent).toContain('After');
	});

	it('leaves every fence as code with none registered, and a language with no renderer', () => {
		const { container, unmount } = render(Markdown, { props: { content } });
		expect(screen.queryByTestId('visual')).not.toBeInTheDocument();
		expect(container.querySelector('code.language-chart')).not.toBeNull();
		unmount();

		const other = render(Markdown, { props: { content, visuals: { timeline: visual } } });
		expect(screen.queryByTestId('visual')).not.toBeInTheDocument();
		expect(other.container.querySelector('code.language-chart')).not.toBeNull();
	});

	it('does not treat an inherited property name as a registered language', () => {
		const { container } = render(Markdown, {
			props: { content: '```constructor\nx\n```', visuals: { chart: visual } }
		});
		expect(container.querySelector('code.language-constructor')).not.toBeNull();
	});

	it('leaves a fence inside another code block as the text it is', () => {
		const { container } = render(Markdown, {
			props: {
				content: '````markdown\n```chart\na\n```\n````',
				visuals: { chart: visual }
			}
		});
		expect(screen.queryByTestId('visual')).not.toBeInTheDocument();
		expect(container.textContent).toContain('```chart');
	});
});

describe('a written page in its frame', () => {
	it('loses a refresh, which would navigate the frame past any policy, and keeps the rest', () => {
		const shown = framed(
			'<html><head><META HTTP-EQUIV="Refresh" content="0;url=https://evil.example/?d=1"></head><body><p>Kept</p></body></html>'
		);
		expect(shown.startsWith(FRAME_CSP)).toBe(true);
		expect(shown.toLowerCase()).not.toContain('refresh');
		expect(shown).toContain('<p>Kept</p>');
	});
});
