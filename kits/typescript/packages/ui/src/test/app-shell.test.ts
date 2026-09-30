/**
 * Behaviour proof for the application shell (rules-library/core/73-verification.md
 * §"Behaviour vs Appearance").
 *
 * The shell is the most stateful thing this package ships: a drawer that opens
 * and closes, a rail that collapses, a palette on a keyboard shortcut, a theme
 * action. A render assertion proves none of it — a shell whose hamburger is
 * wired to nothing draws identically to one that works. So every test here
 * DRIVES the control and reads the outcome, and the outcomes that are not DOM
 * presence (the theme flip, the palette's navigation) are read off non-visual
 * probes in the harness rather than inferred from pixels.
 *
 * What this file deliberately does NOT assert: anything about colour, width or
 * layout. jsdom applies no stylesheet and returns unresolved `var(--…)` literals
 * for computed styles, so it would pass on a completely unregistered colour —
 * the blind spot that has now hidden five defects in this programme. Those
 * claims are made in a real browser instead; see `harness/README.md`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ShellHarness from './app-shell.svelte';
import { isNavItemActive, toGroups, toItems } from '$lib/components/ui/app-shell/types.js';

describe('AppShell — mobile navigation', () => {
	it('opens the drawer from the menu control and closes it again', async () => {
		render(ShellHarness);
		expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await waitFor(() => expect(screen.getByTestId('ds-shell-drawer')).toBeInTheDocument());
		expect(screen.getByTestId('ds-shell-menu')).toHaveAttribute('aria-expanded', 'true');

		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await waitFor(() => expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument());
	});

	it('closes the drawer on Escape', async () => {
		render(ShellHarness);
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await waitFor(() => expect(screen.getByTestId('ds-shell-drawer')).toBeInTheDocument());

		await fireEvent.keyDown(window, { key: 'Escape' });

		await waitFor(() => expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument());
	});

	it('closes the drawer when the path changes, so a tap-through is not covered', async () => {
		// The failure this guards is the one the reference shell earned its
		// $effect for: tap a link, navigate, and the drawer stays over the page
		// you just opened. Driving the path is what proves the effect is wired.
		const { rerender } = render(ShellHarness, { props: { currentPath: '/overview' } });
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await waitFor(() => expect(screen.getByTestId('ds-shell-drawer')).toBeInTheDocument());

		await rerender({ currentPath: '/credentials' });

		await waitFor(() => expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument());
	});

	it('never renders the consumer’s slots twice, open or closed', async () => {
		// The rail and the drawer are one element in two states precisely so this
		// holds. Rendering the rail's contents twice would put a second live copy
		// of whatever the app passed as `identity` in the DOM — their menu, their
		// test hooks, any `id` they wrote — and leave getElementById answering
		// with whichever came first. The reference shell did exactly that.
		render(ShellHarness, { props: { collapsible: true } });
		expect(screen.getAllByTestId('identity')).toHaveLength(1);
		expect(screen.getAllByTestId('ds-rail-collapse')).toHaveLength(1);

		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await waitFor(() => expect(screen.getByTestId('ds-shell-drawer')).toBeInTheDocument());

		expect(screen.getAllByTestId('identity')).toHaveLength(1);
		expect(screen.getAllByTestId('ds-rail-collapse')).toHaveLength(1);
		// One navigation landmark, not two competing ones with the same name.
		expect(document.querySelectorAll('nav[aria-label="Primary"]')).toHaveLength(1);
	});

	it('closes the drawer from its own close control', async () => {
		render(ShellHarness);
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		const drawer = await screen.findByTestId('ds-shell-drawer');

		await fireEvent.click(within(drawer, 'Close menu'));

		await waitFor(() => expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument());
	});
});

describe('AppShell — focus follows the overlay', () => {
	// A drawer that opens without taking focus strands a keyboard user behind an
	// overlay they cannot see; one that closes without returning focus drops them
	// at the top of the document. Both are invisible to a screenshot, and neither
	// is something a consuming app can fix from outside the component.
	it('moves focus into the drawer on open and back to the trigger on close', async () => {
		render(ShellHarness);
		const trigger = screen.getByTestId('ds-shell-menu');
		trigger.focus();

		await fireEvent.click(trigger);
		const drawer = await screen.findByTestId('ds-shell-drawer');
		await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));

		await fireEvent.keyDown(window, { key: 'Escape' });

		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it('returns focus when the drawer is dismissed by its own close control', async () => {
		render(ShellHarness);
		const trigger = screen.getByTestId('ds-shell-menu');
		await fireEvent.click(trigger);
		const drawer = await screen.findByTestId('ds-shell-drawer');

		await fireEvent.click(within(drawer, 'Close menu'));

		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it('keeps the scrim out of the tab order, since Escape and the close button dismiss', async () => {
		render(ShellHarness);
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await screen.findByTestId('ds-shell-drawer');

		const scrim = document.querySelector<HTMLElement>('.fixed.inset-0[aria-label="Dismiss menu"]');
		expect(scrim).not.toBeNull();
		expect(scrim!.tabIndex).toBe(-1);

		// The three dismiss-adjacent controls that coexist while the drawer is open
		// must not share one accessible name: an invisible full-viewport backdrop
		// and a visible X button both called "Close menu" is two indistinguishable
		// controls to a screen reader, and an ambiguous by-role query to a test.
		const drawer = screen.getByTestId('ds-shell-drawer');
		const names = [
			scrim!.getAttribute('aria-label'),
			drawer.querySelector('button[aria-label]')!.getAttribute('aria-label'),
			screen.getByTestId('ds-shell-menu').getAttribute('aria-label')
		];
		expect(new Set(names).size, `duplicate accessible names: ${names}`).toBe(3);
	});
});

describe('AppShell — the drawer is a real modal', () => {
	it('announces itself as a modal dialogue only while it is the overlay', async () => {
		render(ShellHarness);
		const rail = document.querySelector('.ds-shell-rail')!;
		// At rest it is an ordinary complementary landmark, not a dialogue nobody
		// opened. The role is only correct while the thing is actually covering
		// the page.
		expect(rail).not.toHaveAttribute('role');

		await fireEvent.click(screen.getByTestId('ds-shell-menu'));

		await waitFor(() => {
			expect(rail).toHaveAttribute('role', 'dialog');
			expect(rail).toHaveAttribute('aria-modal', 'true');
		});

		await fireEvent.keyDown(window, { key: 'Escape' });
		await waitFor(() => expect(rail).not.toHaveAttribute('role'));
	});

	it('wraps Tab at the end of the overlay instead of leaking into the page', async () => {
		render(ShellHarness);
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		const drawer = await screen.findByTestId('ds-shell-drawer');

		const focusable = [...drawer.querySelectorAll<HTMLElement>('a[href], button')].filter(
			(el) => el.tabIndex !== -1
		);
		const last = focusable[focusable.length - 1];
		last.focus();

		await fireEvent.keyDown(last, { key: 'Tab' });

		// Without the wrap, focus lands on whatever follows the overlay in the
		// document — content the user cannot see.
		await waitFor(() => expect(document.activeElement).toBe(focusable[0]));
	});

	it('closes itself when the viewport grows past the breakpoint', async () => {
		// Open on a phone, then widen: the rail is back in flow, so an overlay
		// still flagged open would be a stale state AND a lie about modality.
		const listeners: Array<() => void> = [];
		const matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			addEventListener: (_: string, fn: () => void) => listeners.push(fn),
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => true,
			onchange: null
		}));
		const original = window.matchMedia;
		Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
		try {
			render(ShellHarness);
			await fireEvent.click(screen.getByTestId('ds-shell-menu'));
			await waitFor(() => expect(screen.getByTestId('ds-shell-drawer')).toBeInTheDocument());

			matchMedia.mock.results.forEach((r) => ((r.value as { matches: boolean }).matches = true));
			listeners.forEach((fn) => fn());

			await waitFor(() => expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument());
		} finally {
			Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
		}
	});
});

describe('AppShell — navLabel (design-system#14)', () => {
	// #14: AppNav's own `label` defaults to "Primary" but AppShell never
	// forwarded it, so a consumer replacing their own labelled landmark with the
	// shared shell silently lost the name.
	it('defaults to "Primary", unchanged, when not set', () => {
		render(ShellHarness);
		expect(document.querySelectorAll('nav[aria-label="Primary"]')).toHaveLength(1);
	});

	it('renames the rail/drawer landmark', () => {
		render(ShellHarness, { props: { navLabel: 'Section nav' } });
		expect(document.querySelectorAll('nav[aria-label="Section nav"]')).toHaveLength(1);
		expect(document.querySelectorAll('nav[aria-label="Primary"]')).toHaveLength(0);
	});
});

describe('AppShell — the toggle and the region it opens are related (#12)', () => {
	// A fair jsdom claim, and the reason it is here rather than in the harness:
	// this is a DOM RELATIONSHIP, not a resolved style. `aria-expanded` already
	// said the control was open; `aria-controls` is the other half — it says what
	// it opened, which is how assistive technology offers to jump to the region
	// instead of trusting DOM order, and how automated tooling can tell the two
	// elements are related at all.
	//
	// `getElementById` is the assertion rather than a string compare on purpose:
	// the id is generated per instance, so what matters is that the reference
	// RESOLVES, not what it happens to spell.
	it('the toggle points at the region it opened', async () => {
		render(ShellHarness);
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		const region = await screen.findByTestId('ds-shell-drawer');

		const controls = screen.getByTestId('ds-shell-menu').getAttribute('aria-controls');
		expect(controls, 'the toggle names no region').toBeTruthy();
		expect(document.getElementById(controls!)).toBe(region);
	});

	it('rail: names the rail even while closed, because it is always in the document', () => {
		// The rail and the drawer are ONE element, so the reference is live from
		// first render — there is no window in which it dangles.
		render(ShellHarness);
		const controls = screen.getByTestId('ds-shell-menu').getAttribute('aria-controls');
		expect(controls).toBeTruthy();
		expect(document.getElementById(controls!)).toHaveClass('ds-shell-rail');
	});

	it('gives two shells on one page distinct regions', async () => {
		// A literal id would collide with itself here, and `getElementById` would
		// answer with whichever rendered first — the same coin toss the rail
		// avoids by refusing to render its contents twice.
		render(ShellHarness);
		render(ShellHarness);
		const toggles = screen.getAllByTestId('ds-shell-menu');
		for (const toggle of toggles) await fireEvent.click(toggle);

		const ids = toggles.map((toggle) => toggle.getAttribute('aria-controls'));
		expect(ids.every(Boolean)).toBe(true);
		expect(new Set(ids).size).toBe(2);
	});
});

describe('AppShell — rail collapse', () => {
	it('offers the collapse control without the app asking for one', () => {
		// On by default. It was opt-in while the control was being introduced and
		// two of nine household apps opted in, so seven rails could not be collapsed
		// for no reason anyone had chosen — the shell shape is not an app's to pick.
		render(ShellHarness);
		expect(screen.getAllByTestId('ds-rail-collapse')).toHaveLength(1);
	});

	it('withdraws the collapse control when an app genuinely refuses it', () => {
		render(ShellHarness, { props: { collapsible: false } });
		expect(screen.queryByTestId('ds-rail-collapse')).not.toBeInTheDocument();
	});

	it('collapses and expands, reporting the state back to the app', async () => {
		render(ShellHarness, { props: { collapsible: true } });
		expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('expanded');

		await fireEvent.click(screen.getByTestId('ds-rail-collapse'));
		// The bound prop is the outcome: an app persists this, so a collapse that
		// only changed an internal flag would silently fail to survive a reload.
		await waitFor(() =>
			expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('collapsed')
		);
		expect(screen.getByTestId('ds-rail-collapse')).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.click(screen.getByTestId('ds-rail-collapse'));
		await waitFor(() =>
			expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('expanded')
		);
	});

	it('keeps every label reachable to assistive tech when collapsed', async () => {
		render(ShellHarness, { props: { collapsible: true } });
		await fireEvent.click(screen.getByTestId('ds-rail-collapse'));

		// Icon-only must not mean name-less: the accessible name survives as
		// sr-only text plus a title, so the rail stays navigable by screen reader.
		await waitFor(() => {
			const link = document.querySelector<HTMLAnchorElement>(
				'.ds-shell-rail a[href="/identities"]'
			)!;
			expect(link).toHaveAttribute('title', 'Identities');
			expect(link.textContent).toContain('Identities');
		});
	});

	it('sits in the rail head, on the brand row, above the nav — not at the foot', () => {
		// The move that motivated this: a control acting on the rail belongs at the
		// rail's own top edge, sharing the brand row, not a full-width row at the
		// foot reading like a navigation destination. Proven by DOM order, since
		// jsdom applies no layout — the toggle shares the brand link's parent and
		// precedes the nav body.
		render(ShellHarness, { props: { collapsible: true } });
		const rail = document.querySelector('.ds-shell-rail')!;
		const toggle = screen.getByTestId('ds-rail-collapse');
		const brand = rail.querySelector<HTMLElement>('a[aria-label="Harness"]')!;
		const nav = rail.querySelector('nav')!;

		expect(toggle.parentElement).toContainElement(brand);
		expect(
			toggle.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
			'the toggle should precede the nav body'
		).toBeTruthy();
	});

	it('names the toggle for its action in both states', async () => {
		// Icon-only in both states, so the accessible name is the whole label and
		// has to say what pressing it will DO — which flips with the state.
		render(ShellHarness, { props: { collapsible: true } });
		const toggle = screen.getByTestId('ds-rail-collapse');
		expect(toggle).toHaveAttribute('aria-label', 'Collapse sidebar');
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(toggle).toHaveAttribute('title', 'Collapse sidebar (press [)');

		await fireEvent.click(toggle);

		await waitFor(() => expect(toggle).toHaveAttribute('aria-label', 'Expand sidebar'));
		expect(toggle).toHaveAttribute('aria-pressed', 'true');
		expect(toggle).toHaveAttribute('title', 'Expand sidebar (press [)');
	});

	it('toggles the rail from the [ keyboard shortcut', async () => {
		// The shortcut rides the window keydown the shell already owns for Escape,
		// so this is a real outcome (the bound state flips), not a render.
		render(ShellHarness, { props: { collapsible: true } });
		expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('expanded');

		await fireEvent.keyDown(window, { key: '[' });
		await waitFor(() =>
			expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('collapsed')
		);

		await fireEvent.keyDown(window, { key: '[' });
		await waitFor(() =>
			expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('expanded')
		);
	});

	it('leaves the [ shortcut alone while the user is typing in a field', async () => {
		// A bare printable key bound globally would eat every `[` typed into an
		// input; the guard yields when focus is on an editable element.
		render(ShellHarness, { props: { collapsible: true } });
		const input = document.createElement('input');
		document.body.appendChild(input);
		try {
			input.focus();
			await fireEvent.keyDown(input, { key: '[' });
			expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('expanded');
		} finally {
			input.remove();
		}
	});

	it('offers no [ shortcut when an app genuinely refuses the collapse control', async () => {
		render(ShellHarness, { props: { collapsible: false } });
		await fireEvent.keyDown(window, { key: '[' });
		// Nothing to toggle: the harness stays expanded and no toggle exists.
		expect(screen.getByTestId('probe-collapsed')).toHaveTextContent('expanded');
		expect(screen.queryByTestId('ds-rail-collapse')).not.toBeInTheDocument();
	});
});

describe('AppShell — searchPlacement', () => {
	// Search is a global affordance. Where it sits changes what it reads AS: after
	// the `context` slot it looks like route context; over with the theme toggle
	// and identity it reads as global. The prop moves the SAME button — same
	// testid, same behaviour — so these assert position, not a second control.
	it('renders search in the leading position by default', () => {
		render(ShellHarness);
		const search = screen.getByTestId('ds-shell-search');
		// Leading sits directly on the bar, ahead of the right-hand controls group,
		// not inside it.
		expect(search.parentElement).toHaveClass('ds-shell-bar');
		expect(search.closest('.ml-auto')).toBeNull();
	});

	it('moves search into the trailing controls group, before actions, when asked', () => {
		render(ShellHarness, { props: { searchPlacement: 'trailing' } });
		const search = screen.getByTestId('ds-shell-search');
		const group = search.closest('.ml-auto');

		// Now inside the same right-hand group as the theme toggle...
		expect(group).not.toBeNull();
		expect(group).toContainElement(screen.getByTestId('ds-shell-theme'));
		// ...and ahead of the app's own `actions` in that group.
		const action = screen.getByTestId('action');
		expect(
			search.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
			'search should precede actions in the trailing group'
		).toBeTruthy();
	});

	it('still opens the palette from the trailing position', async () => {
		// Position is the only thing that changes: the button is the same one, so
		// its behaviour has to survive the move.
		render(ShellHarness, { props: { searchPlacement: 'trailing' } });
		expect(screen.getByTestId('probe-palette')).toHaveTextContent('closed');

		await fireEvent.click(screen.getByTestId('ds-shell-search'));

		await waitFor(() => expect(screen.getByTestId('probe-palette')).toHaveTextContent('open'));
	});

	it('renders exactly one search button in either placement', () => {
		// Never both positions at once — the prop chooses one home for the button.
		const { unmount } = render(ShellHarness);
		expect(screen.getAllByTestId('ds-shell-search')).toHaveLength(1);
		unmount();

		render(ShellHarness, { props: { searchPlacement: 'trailing' } });
		expect(screen.getAllByTestId('ds-shell-search')).toHaveLength(1);
	});
});

describe('AppShell — top bar', () => {
	it('runs the theme action when the toggle is pressed', async () => {
		render(ShellHarness);
		expect(screen.getByTestId('probe-theme')).toHaveTextContent('0');

		await fireEvent.click(screen.getByTestId('ds-shell-theme'));

		await waitFor(() => expect(screen.getByTestId('probe-theme')).toHaveTextContent('1'));
	});

	it('opens the palette from the search affordance', async () => {
		render(ShellHarness);
		expect(screen.getByTestId('probe-palette')).toHaveTextContent('closed');

		await fireEvent.click(screen.getByTestId('ds-shell-search'));

		await waitFor(() => expect(screen.getByTestId('probe-palette')).toHaveTextContent('open'));
	});

	it('renders the consumer-supplied slots without the package knowing them', () => {
		render(ShellHarness);
		expect(screen.getByTestId('identity')).toBeInTheDocument();
		expect(screen.getByTestId('banner')).toBeInTheDocument();
		expect(screen.getByTestId('action')).toBeInTheDocument();
		expect(screen.getByText('Page body')).toBeInTheDocument();
	});

	it('carries a bypass link that targets the main landmark', () => {
		render(ShellHarness);
		const skip = screen.getByText('Skip to content');
		expect(skip).toHaveAttribute('href', '#ds-main');
		expect(document.querySelector('#ds-main')).not.toBeNull();
	});
});

describe('AppShell — active state', () => {
	it('marks the current item and only the current item', () => {
		render(ShellHarness, { props: { currentPath: '/credentials' } });
		const rail = document.querySelector('.ds-shell-rail')!;

		expect(rail.querySelector('a[href="/credentials"]')).toHaveAttribute('aria-current', 'page');
		expect(rail.querySelector('a[href="/overview"]')).not.toHaveAttribute('aria-current');
		// aria-current alone is not enough for a sighted user (WCAG 1.4.1), so the
		// non-colour indicator has to be there too.
		expect(rail.querySelector('a[href="/credentials"] .ds-nav-indicator')).not.toBeNull();
	});

	it('keeps a section root lit on its children', () => {
		render(ShellHarness, { props: { currentPath: '/credentials/abc123' } });
		const rail = document.querySelector('.ds-shell-rail')!;
		expect(rail.querySelector('a[href="/credentials"]')).toHaveAttribute('aria-current', 'page');
	});

	it('renders an external item as a safe new-tab link', () => {
		render(ShellHarness);
		const link = document.querySelector<HTMLAnchorElement>('.ds-shell-rail a[target="_blank"]')!;
		expect(link.rel).toContain('noreferrer');
		expect(link.rel).toContain('noopener');
	});

	it('renders a badge when the item carries one', () => {
		render(ShellHarness);
		const badge = document.querySelector('.ds-shell-rail a[href="/credentials"] .ds-nav-badge');
		expect(badge).toHaveTextContent('3');
	});
});

describe('CommandPalette', () => {
	it('opens on the keyboard shortcut and closes on a second press', async () => {
		render(ShellHarness);
		expect(screen.getByTestId('probe-palette')).toHaveTextContent('closed');

		await fireEvent.keyDown(document, { key: 'k', metaKey: true });
		await waitFor(() => expect(screen.getByTestId('probe-palette')).toHaveTextContent('open'));

		await fireEvent.keyDown(document, { key: 'k', metaKey: true });
		await waitFor(() => expect(screen.getByTestId('probe-palette')).toHaveTextContent('closed'));
	});

	it('accepts the control-key form for a non-Mac keyboard', async () => {
		render(ShellHarness);
		await fireEvent.keyDown(document, { key: 'K', ctrlKey: true });
		await waitFor(() => expect(screen.getByTestId('probe-palette')).toHaveTextContent('open'));
	});

	it('ignores a bare k, so typing in the page does not open it', async () => {
		render(ShellHarness);
		await fireEvent.keyDown(document, { key: 'k' });
		expect(screen.getByTestId('probe-palette')).toHaveTextContent('closed');
	});

	it('lists the same navigation the shell renders', async () => {
		render(ShellHarness);
		await fireEvent.keyDown(document, { key: 'k', metaKey: true });

		await waitFor(() => expect(screen.getByPlaceholderText('Search the harness…')).toBeVisible());
		const dialog = screen.getByRole('dialog');
		for (const label of ['Overview', 'Credentials', 'Identities', 'Docs']) {
			expect(within(dialog, label)).toBeInTheDocument();
		}
	});

	it('actually navigates on select, and closes itself', async () => {
		// The whole point of the palette. A version that opened, listed and did
		// nothing on select would pass every render check ever written.
		render(ShellHarness);
		await fireEvent.keyDown(document, { key: 'k', metaKey: true });
		await waitFor(() => expect(screen.getByPlaceholderText('Search the harness…')).toBeVisible());

		await fireEvent.click(within(screen.getByRole('dialog'), 'Identities'));

		await waitFor(() => {
			expect(screen.getByTestId('probe-navigated')).toHaveTextContent('/identities');
		});
		expect(screen.getByTestId('probe-palette')).toHaveTextContent('closed');
	});

	it('filters to what was typed', async () => {
		render(ShellHarness);
		await fireEvent.keyDown(document, { key: 'k', metaKey: true });
		const input = await screen.findByPlaceholderText('Search the harness…');

		await fireEvent.input(input, { target: { value: 'ident' } });

		await waitFor(() => {
			const dialog = screen.getByRole('dialog');
			expect(within(dialog, 'Identities')).toBeInTheDocument();
			expect(queryWithin(dialog, 'Overview')).toBeNull();
		});
	});
});

describe('the navigation vocabulary', () => {
	it('collapses a run of bare items into one group rather than one each', () => {
		const groups = toGroups([
			{ label: 'A', href: '/a' },
			{ label: 'B', href: '/b' },
			{ heading: 'G', items: [{ label: 'C', href: '/c' }] },
			{ label: 'D', href: '/d' }
		]);
		expect(groups.map((g) => g.items.map((i) => i.label))).toEqual([['A', 'B'], ['C'], ['D']]);
	});

	it('drops a group with no items, so a fully-filtered group leaves no gap', () => {
		// Both surveyed apps that filter nav by permission can empty a whole
		// group; a rendered heading with nothing under it is the visible defect.
		expect(toGroups([{ heading: 'Admin', items: [] }])).toEqual([]);
	});

	it('flattens to items in source order for the palette', () => {
		const items = toItems([
			{ label: 'A', href: '/a' },
			{ heading: 'G', items: [{ label: 'B', href: '/b' }] }
		]);
		expect(items.map((i) => i.label)).toEqual(['A', 'B']);
	});

	it('treats a root href as exact, or it would match every path', () => {
		const root = { label: 'Home', href: '/' };
		expect(isNavItemActive(root, '/')).toBe(true);
		expect(isNavItemActive(root, '/anything')).toBe(false);
	});

	it('does not let a prefix match run past a path segment', () => {
		const item = { label: 'Audit', href: '/audit' };
		expect(isNavItemActive(item, '/audit/42')).toBe(true);
		expect(isNavItemActive(item, '/audit-log')).toBe(false);
	});

	it('honours an opt-in exact match', () => {
		const item = { label: 'Dashboard', href: '/module', exact: true };
		expect(isNavItemActive(item, '/module')).toBe(true);
		expect(isNavItemActive(item, '/module/detail')).toBe(false);
	});

	it('marks nothing active when the app supplies no path', () => {
		expect(isNavItemActive({ label: 'A', href: '/a' }, undefined)).toBe(false);
	});

	describe('matchPrefixes (design-system#10)', () => {
		it('lights a root item on an additional prefix, the case exact-forcing otherwise makes unreachable', () => {
			const root = { label: 'Home', href: '/', matchPrefixes: ['/people'] };
			// href stays exact for itself — unaffected by the additional prefix.
			expect(isNavItemActive(root, '/')).toBe(true);
			expect(isNavItemActive(root, '/anything')).toBe(false);
			// The additional prefix is prefix-matched, not exact.
			expect(isNavItemActive(root, '/people')).toBe(true);
			expect(isNavItemActive(root, '/people/42')).toBe(true);
		});

		it('lights a non-root item on an additional prefix too', () => {
			const item = { label: 'Browse', href: '/browse', matchPrefixes: ['/subjects'] };
			expect(isNavItemActive(item, '/browse/anything')).toBe(true);
			expect(isNavItemActive(item, '/subjects')).toBe(true);
			expect(isNavItemActive(item, '/subjects/42')).toBe(true);
		});

		it('does not let an additional prefix match run past a path segment either', () => {
			const item = { label: 'Browse', href: '/browse', matchPrefixes: ['/subjects'] };
			expect(isNavItemActive(item, '/subjects-archive')).toBe(false);
		});

		it('leaves an item with no matchPrefixes exactly as before', () => {
			const item = { label: 'Audit', href: '/audit' };
			expect(isNavItemActive(item, '/audit/42')).toBe(true);
			expect(isNavItemActive(item, '/elsewhere')).toBe(false);
		});
	});
});

describe('AppShell — mobile-drawer close is unaffected by matchPrefixes (design-system#10)', () => {
	// #10's own constraint: the trap a consumer would otherwise reach for is
	// passing a doctored currentPath to fake the highlight, which quietly
	// breaks this close-on-navigate effect because it reads the same prop.
	// matchPrefixes only changes isNavItemActive's own verdict, never
	// currentPath handling, so this must still fire on every path change,
	// including a change onto a path an item claims only via matchPrefixes.
	it('still closes on any currentPath change, independent of which item lights', async () => {
		const { rerender } = render(ShellHarness, { props: { currentPath: '/overview' } });
		await fireEvent.click(screen.getByTestId('ds-shell-menu'));
		await waitFor(() => expect(screen.getByTestId('ds-shell-drawer')).toBeInTheDocument());

		// The harness's own nav has no matchPrefixes item, so this proves the
		// effect fires on the prop alone, not on any active-item recomputation.
		await rerender({ currentPath: '/identities' });

		await waitFor(() => {
			expect(screen.queryByTestId('ds-shell-drawer')).not.toBeInTheDocument();
		});
	});
});

/** The element inside `root` whose trimmed text is exactly `text`. */
function within(root: HTMLElement, text: string): HTMLElement {
	const found = queryWithin(root, text);
	if (!found) throw new Error(`no element with text "${text}" inside the given root`);
	return found;
}

function queryWithin(root: HTMLElement, text: string): HTMLElement | null {
	const candidates = root.querySelectorAll<HTMLElement>('a, button, [role="option"], [data-slot]');
	for (const el of candidates) {
		if (el.textContent?.trim() === text || el.getAttribute('aria-label') === text) return el;
	}
	return null;
}
