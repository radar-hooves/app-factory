/**
* A document the persona wrote, in the reading column: Markdown through the
* sanitising renderer, HTML only in an empty-sandbox frame, every version
* reachable, and the fence seam for a host's own visualisation.
*/
import { FRAME_CSP, framed } from '$lib/written';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ArtefactPane from '$lib/components/artefact-pane/artefact-pane.svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import Markdown from '$lib/components/markdown/markdown.svelte';
import type { Turn } from '$lib/transcript.svelte';
import type { Written } from '$lib/written';
import Fence from './fixtures/fence.svelte';

const v1: Written = { name: 'brief.md', version: 1, media_type: 'text/markdown', formats: ['pdf'] };
const v2: Written = { name: 'brief.md', version: 2, media_type: 'text/markdown', formats: ['pdf'] };
const page: Written = { name: 'site/page.html', version: 1, media_type: 'text/html', formats: [] };

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
		expect(srcdoc.startsWith('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'')).toBe(true);
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
		expect([...picker.options].map((o) => o.textContent)).toEqual(['Version 1', 'Version 2']);
		expect(screen.getByRole('link', { name: 'Markdown' })).toHaveAttribute(
			'href',
			'/a?brief.md&2&source'
		);
		expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/a?brief.md&2&pdf');

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
		expect(screen.getAllByRole('link', { name: 'Markdown' })).toHaveLength(2);
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

describe('fenced code a host draws', () => {
	const content = 'Before\n\n```chart\na\nb\n```\n\n```python\nprint(1)\n```\n';

	it('hands a registered language’s source to the host’s component', async () => {
		const { container } = render(Markdown, { props: { content, fences: { chart: Fence } } });

		await waitFor(() => expect(screen.getByTestId('chart')).toHaveTextContent('2 rows'));
		expect(container.textContent).toContain('print(1)');
		expect(container.querySelector('code.language-chart')).toBeNull();
	});

	it('leaves every fence as code with none registered, or while streaming', () => {
		const { container, unmount } = render(Markdown, { props: { content } });
		expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
		expect(container.querySelector('code.language-chart')).not.toBeNull();
		unmount();

		const streaming = render(Markdown, {
			props: { content, streaming: true, fences: { chart: Fence } }
		});
		expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
		expect(streaming.container.querySelector('code.language-chart')).not.toBeNull();
	});

	it('does not treat an inherited property name as a registered language', () => {
		const { container } = render(Markdown, {
			props: { content: '```constructor\nx\n```', fences: { chart: Fence } }
		});
		expect(container.querySelector('code.language-constructor')).not.toBeNull();
	});
});

describe('a written page in its frame', () => {
	it('loses a refresh, which would navigate the frame past any policy, and keeps the rest', () => {
		const shown = framed('<html><head><META HTTP-EQUIV="Refresh" content="0;url=https://evil.example/?d=1"></head><body><p>Kept</p></body></html>');
		expect(shown.startsWith(FRAME_CSP)).toBe(true);
		expect(shown.toLowerCase()).not.toContain('refresh');
		expect(shown).toContain('<p>Kept</p>');
	});
});
