/**
 * Behaviour proof for DocumentReader: the header, the body, and the contents
 * list built from the body's own h2/h3, including the ids it gives them, what
 * a click does, and the loading and error states.
 *
 * Not asserted: that the contents sit beside the body on a wide reader and
 * fold into a disclosure on a narrow one. That is a container query on the
 * reader's own width, which jsdom does not apply, so BOTH copies of the list
 * are in the DOM here and the tests address "a contents nav", never which.
 * Reading-line highlighting (`aria-current="location"` on scroll) needs real
 * layout and is not asserted either.
 *
 * jsdom supplies `CSS.escape` and setup.ts stubs `window.matchMedia`, so no polyfill is
 * needed; `scrollIntoView` is spied on per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import DocumentReader, { slugify } from '$lib/components/ui/document-reader/document-reader.svelte';
import { createRawSnippet } from 'svelte';

const asideFacts = createRawSnippet(() => ({ render: () => '<p>Owner: Pay policy</p>' }));

const scrollSpy = vi.fn();
beforeEach(() => {
	scrollSpy.mockClear();
	Element.prototype.scrollIntoView = scrollSpy;
	window.location.hash = '';
});

const body = `
	<p>Intro</p>
	<h2>Getting started</h2><p>One</p>
	<h3>Install it</h3><p>Two</p>
	<h2>Getting started</h2><p>Three</p>
	<h2 id="custom-id">Already named</h2><p>Four</p>
`;

const contentsNavs = () => screen.queryAllByRole('navigation', { name: 'On this page' });

describe('slugify', () => {
	it('lower-cases and joins words with hyphens', () => {
		expect(slugify('Getting Started')).toBe('getting-started');
	});

	it('strips accents', () => {
		expect(slugify('Café Résumé')).toBe('cafe-resume');
	});

	it('collapses punctuation and trims hyphens from the ends', () => {
		expect(slugify('  What? -- Why!! ')).toBe('what-why');
	});

	it('falls back to "section" when nothing usable is left', () => {
		expect(slugify('')).toBe('section');
		expect(slugify('???')).toBe('section');
	});
});

describe('DocumentReader — the document', () => {
	it('renders the title as the h1 and the body as an article', () => {
		render(DocumentReader, { props: { title: 'The guide', html: body } });
		expect(screen.getByRole('heading', { level: 1, name: 'The guide' })).toBeInTheDocument();
		expect(within(screen.getByRole('article')).getByText('Intro')).toBeInTheDocument();
	});

	it('renders breadcrumbs through the header', () => {
		render(DocumentReader, {
			props: {
				title: 'The guide',
				html: body,
				breadcrumbs: [{ label: 'Docs', href: '/docs' }, { label: 'The guide' }]
			}
		});
		expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
	});
});

describe('DocumentReader — heading ids', () => {
	it('gives headings slug ids, and duplicates a -2 suffix', async () => {
		render(DocumentReader, { props: { title: 'T', html: body } });
		const ids = () =>
			[...screen.getByRole('article').querySelectorAll('h2, h3')].map((h) => h.id);
		await waitFor(() =>
			expect(ids()).toEqual(['getting-started', 'install-it', 'getting-started-2', 'custom-id'])
		);
	});

	it('keeps an id the heading already has', async () => {
		render(DocumentReader, { props: { title: 'T', html: body } });
		const named = await screen.findByRole('heading', { name: 'Already named' });
		expect(named).toHaveAttribute('id', 'custom-id');
	});
});

describe('DocumentReader — the contents list', () => {
	it('renders a landmark named "On this page" listing the headings as links', async () => {
		render(DocumentReader, { props: { title: 'T', html: body } });
		await waitFor(() => expect(contentsNavs().length).toBeGreaterThan(0));
		for (const nav of contentsNavs()) {
			const links = within(nav).getAllByRole('link');
			expect(links.map((a) => a.textContent)).toEqual([
				'Getting started',
				'Install it',
				'Getting started',
				'Already named'
			]);
			expect(links.map((a) => a.getAttribute('href'))).toEqual([
				'#getting-started',
				'#install-it',
				'#getting-started-2',
				'#custom-id'
			]);
		}
	});

	it('uses a custom contentsLabel as the landmark name', async () => {
		render(DocumentReader, { props: { title: 'T', html: body, contentsLabel: 'Sections' } });
		await waitFor(() =>
			expect(screen.queryAllByRole('navigation', { name: 'Sections' }).length).toBeGreaterThan(0)
		);
		expect(contentsNavs()).toHaveLength(0);
	});

	it('has no contents list with fewer than two headings', async () => {
		render(DocumentReader, { props: { title: 'T', html: '<h2>Only one</h2><p>x</p>' } });
		await screen.findByRole('heading', { name: 'Only one' });
		expect(contentsNavs()).toHaveLength(0);
	});

	it('hides the contents list for contents={false}', async () => {
		render(DocumentReader, { props: { title: 'T', html: body, contents: false } });
		await screen.findAllByRole('heading', { name: 'Getting started' });
		expect(contentsNavs()).toHaveLength(0);
	});

	it('scrolls to the heading and moves focus to it on a click', async () => {
		render(DocumentReader, { props: { title: 'T', html: body } });
		await waitFor(() => expect(contentsNavs().length).toBeGreaterThan(0));
		const link = within(contentsNavs()[0]).getByRole('link', { name: 'Install it' });
		scrollSpy.mockClear();

		await fireEvent.click(link);

		const heading = screen.getByRole('heading', { name: 'Install it' });
		expect(scrollSpy).toHaveBeenCalledTimes(1);
		expect(scrollSpy.mock.contexts[0]).toBe(heading);
		expect(heading).toHaveAttribute('tabindex', '-1');
		expect(heading).toHaveFocus();
	});

	it('rebuilds the list when the html changes', async () => {
		const { rerender } = render(DocumentReader, { props: { title: 'T', html: body } });
		await waitFor(() => expect(contentsNavs().length).toBeGreaterThan(0));

		await rerender({ title: 'T', html: '<h2>Alpha</h2><p>a</p><h2>Beta</h2><p>b</p>' });

		await waitFor(() => {
			const links = within(contentsNavs()[0]).getAllByRole('link');
			expect(links.map((a) => a.textContent)).toEqual(['Alpha', 'Beta']);
		});
	});
});

describe('DocumentReader — loading and error', () => {
	it('keeps the header and shows a skeleton status while loading with a title', () => {
		render(DocumentReader, { props: { title: 'The guide', loading: true } });
		expect(screen.getByRole('heading', { level: 1, name: 'The guide' })).toBeInTheDocument();
		const status = screen.getByRole('status');
		expect(status).toHaveAttribute('data-slot', 'content-skeleton');
		expect(status).toHaveAttribute('aria-busy', 'true');
		expect(screen.queryByRole('article')).not.toBeInTheDocument();
	});

	it('shows the loading state alone while loading with no title', () => {
		render(DocumentReader, { props: { loading: true } });
		expect(screen.getByRole('status', { name: /Loading the document…/ })).toBeInTheDocument();
		expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
	});

	it('shows the error message with a Retry button that calls onRetry', async () => {
		const onRetry = vi.fn();
		render(DocumentReader, {
			props: { title: 'T', html: body, error: 'Could not load it', onRetry }
		});
		expect(screen.getByText('Could not load it')).toBeInTheDocument();
		expect(screen.queryByRole('article')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('offers no Retry button without onRetry', () => {
		render(DocumentReader, { props: { error: 'Could not load it' } });
		expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
	});
});

describe('DocumentReader — the side column and the disclosure', () => {
	const side = (container: HTMLElement) =>
		container.querySelector('[data-slot="document-reader-side"]');

	it('gives the column back once a body proves to have fewer than two headings', async () => {
		const { container } = render(DocumentReader, {
			props: { title: 'Short', html: '<p>Just a paragraph.</p>' }
		});
		await waitFor(() => expect(side(container)).toBeNull());
	});

	it('keeps the column while the body loads, and for a structured body', async () => {
		const { container, rerender } = render(DocumentReader, {
			props: { title: 'The guide', loading: true }
		});
		await rerender({ title: 'The guide', loading: false, html: body });
		await waitFor(() => expect(side(container)).not.toBeNull());
	});

	it('renders `aside` once, whatever the width', () => {
		render(DocumentReader, {
			props: { title: 'Short', html: '<p>Just a paragraph.</p>', aside: asideFacts }
		});
		expect(screen.getAllByText('Owner: Pay policy')).toHaveLength(1);
	});

	it('survives a fragment that is not valid percent-encoding', async () => {
		window.location.hash = '#%E0%A4%A';
		render(DocumentReader, { props: { title: 'The guide', html: body } });
		await waitFor(() => expect(contentsNavs().length).toBeGreaterThan(0));
	});

	it('folds the disclosure away when one of its links is followed', async () => {
		const { container } = render(DocumentReader, { props: { title: 'The guide', html: body } });
		const details = await waitFor(() => {
			const el = container.querySelector('details');
			if (!el) throw new Error('no disclosure yet');
			return el;
		});
		details.open = true;
		await fireEvent.click(within(details).getByRole('link', { name: 'Install it' }));
		expect(details.open).toBe(false);
	});
});
