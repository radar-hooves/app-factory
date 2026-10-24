/**
 * Page types, in the environment that can fairly judge them.
 *
 * jsdom applies no stylesheet and has no layout engine, so it cannot see a
 * width, a gutter or a column position: `max-width` resolves to nothing and
 * `getBoundingClientRect()` returns zeroes whatever the type says. Asserting
 * geometry here would pass against a build that never imported the stylesheet.
 *
 * So this file proves only the DOM CONTRACT: which attribute the frame writes
 * for each type, where a registered pane or aside renders, what the bar names,
 * and how a pane folds and remembers it. The widths themselves are measured in
 * the real-browser harness. `windowWidth` sets the window the shell's
 * `min-width` queries read (the setup file's default is narrow).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ShellHarness from './app-shell.svelte';
import { windowWidth } from './window-width.js';
import PagePane from '$lib/components/ui/app-shell/page-pane.svelte';
import PageAside from '$lib/components/ui/app-shell/page-aside.svelte';
import { PAGE_TYPES } from '$lib/components/ui/app-shell/page.js';

const frame = () => document.querySelector<HTMLElement>('[data-slot="app-shell-content"] > .ds-page')!;
const pane = () => document.querySelector<HTMLElement>('.ds-page-pane');
const aside = () => document.querySelector<HTMLElement>('aside.ds-page-aside');
const location = () => screen.getByTestId('ds-shell-location');

beforeEach(() => {
	localStorage.clear();
	windowWidth(100);
});

describe('AppShell page types: the frame', () => {
	it('is a reading page when the route declares nothing', () => {
		render(ShellHarness);
		expect(frame().getAttribute('data-page')).toBe('reading');
	});

	it('is a closed scale of three, the default first', () => {
		expect([...PAGE_TYPES]).toEqual(['reading', 'panel', 'tool']);
	});

	it('writes each type to the frame, and holds the page body in the one main slot', () => {
		for (const pageType of PAGE_TYPES) {
			const { container, unmount } = render(ShellHarness, { props: { pageType } });
			const main = container.querySelector('[data-slot="app-shell-content"]')!;
			expect(main.children, pageType).toHaveLength(1);
			expect(frame().getAttribute('data-page'), pageType).toBe(pageType);
			expect(frame().querySelector('[data-slot="page-main"]')?.textContent, pageType).toContain(
				'Page body'
			);
			unmount();
		}
	});

	it('writes no aside or fill marker when the page registers neither', () => {
		render(ShellHarness, { props: { pageType: 'tool' } });
		expect(frame().hasAttribute('data-aside')).toBe(false);
		expect(frame().hasAttribute('data-fill')).toBe(false);
		expect(aside()).toBeNull();
		expect(pane()).toBeNull();
	});
});

describe('AppShell page types: the aside', () => {
	it('stacks a reading page’s aside after the column', () => {
		render(ShellHarness, { props: { aside: true } });
		expect(aside()).not.toBeNull();
		expect(aside()!.textContent).toContain('Aside body');
		expect(aside()).toHaveAccessibleName('Context');
		expect(frame().getAttribute('data-aside')).toBe('stacked');
	});

	it('stands a tool page’s aside beside the content as a column', () => {
		render(ShellHarness, { props: { pageType: 'tool', aside: true } });
		expect(aside()!.textContent).toContain('Aside body');
		expect(frame().getAttribute('data-aside')).toBe('column');
	});

	it('puts the aside after the page body in the frame', () => {
		render(ShellHarness, { props: { pageType: 'tool', aside: true } });
		const main = frame().querySelector('[data-slot="page-main"]')!;
		expect(main.nextElementSibling).toBe(aside());
	});

	it('opens no sheet button where the aside is a column', () => {
		render(ShellHarness, { props: { pageType: 'tool', aside: true } });
		expect(screen.queryByTestId('ds-page-aside-open')).toBeNull();
	});

	it('moves a tool page’s aside to a sheet from the bar below 80rem', () => {
		windowWidth(70);
		render(ShellHarness, { props: { pageType: 'tool', aside: true } });
		expect(aside()).toBeNull();
		expect(frame().hasAttribute('data-aside')).toBe(false);
		expect(screen.getByTestId('ds-page-aside-open')).toBeInTheDocument();
	});

	it('keeps a reading page’s aside in the page at any width', () => {
		windowWidth(40);
		render(ShellHarness, { props: { aside: true } });
		expect(frame().getAttribute('data-aside')).toBe('stacked');
		expect(screen.queryByTestId('ds-page-aside-open')).toBeNull();
	});
});

describe('AppShell page types: the pane', () => {
	it('renders the pane on a panel page, before the content', () => {
		render(ShellHarness, { props: { pageType: 'panel', pane: {} } });
		expect(pane()).not.toBeNull();
		expect(pane()!.textContent).toContain('Pane body');
		expect(pane()!.nextElementSibling).toBe(frame().querySelector('[data-slot="page-main"]'));
	});

	it('makes a page that registers a pane a panel page, whatever its route said', () => {
		for (const pageType of ['reading', 'tool'] as const) {
			const { container, unmount } = render(ShellHarness, { props: { pageType, pane: {} } });
			expect(pane(), pageType).not.toBeNull();
			expect(container.querySelector('.ds-page')).toHaveAttribute('data-page', 'panel');
			unmount();
		}
	});

	it('moves the pane to a sheet from the bar below 64rem', () => {
		windowWidth(50);
		render(ShellHarness, { props: { pageType: 'panel', pane: {} } });
		expect(pane()).toBeNull();
		expect(screen.getByTestId('ds-page-pane-open')).toBeInTheDocument();
	});

	it('marks the frame when the pane’s content fills it', () => {
		render(ShellHarness, { props: { pageType: 'panel', pane: { fill: true } } });
		expect(frame().hasAttribute('data-fill')).toBe(true);
	});
});

describe('AppShell page types: a page that goes', () => {
	// The shell outlives every page, so a page's registration must leave with it:
	// the next page is laid out as itself, never with the last one's columns.
	it('withdraws its pane, and the frame is the next page’s own type', async () => {
		const { rerender } = render(ShellHarness, { props: { pageType: 'reading', pane: {} } });
		expect(pane()).not.toBeNull();
		await rerender({ pageType: 'reading', pane: undefined });
		expect(pane()).toBeNull();
		expect(frame()).toHaveAttribute('data-page', 'reading');
	});

	it('withdraws its aside', async () => {
		const { rerender } = render(ShellHarness, { props: { pageType: 'tool', aside: true } });
		expect(aside()).not.toBeNull();
		await rerender({ pageType: 'tool', aside: false });
		expect(aside()).toBeNull();
		expect(frame().hasAttribute('data-aside')).toBe(false);
	});
});

describe('AppShell page types: the bar’s name', () => {
	it('names the pane’s location on a panel page the nav lacks', () => {
		render(ShellHarness, {
			props: {
				pageType: 'panel',
				currentPath: '/settings/account',
				title: 'Fallback',
				pane: { location: 'Settings › Account' }
			}
		});
		expect(location()).toHaveTextContent('Settings › Account');
	});

	it('names the title where there is no pane location', () => {
		render(ShellHarness, { props: { currentPath: '/elsewhere', title: 'Fallback' } });
		expect(location()).toHaveTextContent('Fallback');
	});

	it('names the page by its title where neither the nav nor a pane does', () => {
		render(ShellHarness, { props: { pageType: 'tool', currentPath: '/elsewhere', title: 'Fallback' } });
		expect(location()).toHaveTextContent('Fallback');
	});

	it('prefers the nav’s own title for a path it knows', () => {
		render(ShellHarness, {
			props: {
				pageType: 'panel',
				currentPath: '/overview',
				title: 'Fallback',
				pane: { location: 'Pane' }
			}
		});
		expect(location()).toHaveTextContent('Overview');
		expect(location()).not.toHaveTextContent('Pane');
	});
});

describe('AppShell page types: a foldable pane', () => {
	it('shows its body until folded, then its folded snippet, and remembers the fold', async () => {
		render(ShellHarness, {
			props: { pageType: 'panel', pane: { folded: true, remember: 'harness-pane-folded' } }
		});
		expect(screen.queryByTestId('pane-folded')).toBeNull();
		expect(localStorage.getItem('harness-pane-folded')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Fold pane' }));

		expect(screen.getByTestId('pane-folded')).toBeInTheDocument();
		expect(screen.queryByTestId('pane-body')).toBeNull();
		expect(pane()!.getAttribute('data-folded')).toBe('true');
		expect(localStorage.getItem('harness-pane-folded')).toBe('1');

		await fireEvent.click(screen.getByTestId('pane-folded'));

		expect(screen.getByTestId('pane-body')).toBeInTheDocument();
		expect(localStorage.getItem('harness-pane-folded')).toBe('0');
	});

	it('opens folded when the reader left it folded', () => {
		localStorage.setItem('harness-pane-folded', '1');
		render(ShellHarness, {
			props: { pageType: 'panel', pane: { folded: true, remember: 'harness-pane-folded' } }
		});
		expect(screen.getByTestId('pane-folded')).toBeInTheDocument();
	});

	it('does not fold a pane that gave no folded snippet', async () => {
		render(ShellHarness, {
			props: { pageType: 'panel', pane: { remember: 'harness-pane-folded' } }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Fold pane' }));
		expect(screen.getByTestId('pane-body')).toBeInTheDocument();
		expect(pane()!.hasAttribute('data-folded')).toBe(false);
	});
});

describe('PagePane and PageAside outside a shell', () => {
	it('render their content in place', () => {
		render(PagePane, {
			props: {
				label: 'Sections',
				body: (anchor: Comment) => {
					anchor.before(document.createTextNode('Pane in place'));
				}
			} as never
		});
		expect(document.body).toHaveTextContent('Pane in place');
	});

	it('PageAside renders its body in place', () => {
		render(PageAside, {
			props: {
				label: 'Context',
				body: (anchor: Comment) => {
					anchor.before(document.createTextNode('Aside in place'));
				}
			} as never
		});
		expect(document.body).toHaveTextContent('Aside in place');
	});
});
