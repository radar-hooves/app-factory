import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_TYPES } from '@poodle64/ui/app-shell';

import Layout from '../routes/(protected)/+layout.svelte';
import TitledPage from '../test/stubs/titled-page.svelte';
import { shell } from './shell.js';

// The shell, as this app wears it: the factory's frame fed by this app's own
// `shell` data (shell.ts), under the signed-in layout, asserted against the
// operator's ruling of 03/11/2026. It ships to every app and runs in its unit
// leg, so an app whose data is malformed, or whose frame was edited, fails here
// rather than in front of the operator. It reads what the DOM does, never how
// the app wrote it, and it is not the app's to edit or delete.
//
//   the bar, from the far right: account, day/night, alerts, report, search;
//   breadcrumbs on the left; the sidebar's toggle on the sidebar's top;
//   Settings in the account menu; no page title, one hidden heading;
//   each page type its own frame.

vi.mock('#lib/api/client.js', () => ({
	api: { GET: vi.fn(), POST: vi.fn() },
	redirectToAuthentik: vi.fn(),
	setActiveWorkspaceId: vi.fn(),
	getActiveWorkspaceId: vi.fn(() => null)
}));

const chat = vi.hoisted(() => ({ handOff: vi.fn() }));
vi.mock('#lib/agent/chat.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/agent/chat.js')>()),
	personasOf: () => Promise.resolve([{ id: 'milton', name: 'Milton' }]),
	handOff: chat.handOff
}));

vi.mock('#lib/alerts/admin-alert-bell.svelte', () => import('../test/stubs/alert-bell.svelte'));

const route = vi.hoisted(() => ({
	url: new URL('http://localhost/'),
	params: {},
	data: {} as Record<string, unknown>
}));
vi.mock('$app/state', () => ({ page: route }));

vi.mock('#lib/auth.svelte.js', () => {
	const workspace = { id: 7, slug: 'personal-1', name: 'personal-1' };
	return {
		auth: {
			init: vi.fn(),
			isLoading: false,
			failure: null,
			user: { id: 1, username: 'someone', display_name: 'Some One', email: null },
			isAuthenticated: true,
			workspaces: [{ workspace, role: 'owner' }],
			activeWorkspace: workspace,
			canSwitchWorkspace: false,
			needsWorkspaceChoice: false,
			activeRole: 'owner',
			entitlements: [],
			canViewAs: false,
			can: () => true,
			setActiveWorkspace: vi.fn(),
			logout: vi.fn()
		}
	};
});

// A viewer for a `nav(viewer)` that gates rows on `viewer.can`.
const viewer = { can: () => true } as never;

const children = createRawSnippet(() => ({
	render: () => '<p data-testid="the-page">the page</p>'
}));

const follows = (a: Element, b: Element) =>
	Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
	route.url = new URL('http://localhost/');
	route.data = {};
});

describe('the app declares its shell as data', () => {
	it('names itself, and gives a nav the rail can draw', () => {
		expect(shell.workspaceLabel).toBeTruthy();
		expect(shell.brand.title).toBeTruthy();
		const nav = typeof shell.nav === 'function' ? shell.nav(viewer) : shell.nav;
		expect(nav.length).toBeGreaterThan(0);
	});
});

describe('the bar', () => {
	it('runs, from the left, search, report, alerts, day/night, account', async () => {
		render(Layout, { props: { children } });
		const search = screen.getByTestId('ds-shell-search');
		const report = await screen.findByTestId('ds-shell-report');
		const alerts = screen.getByTestId('alerts');
		const theme = screen.getByTestId('ds-shell-theme');
		const account = screen.getByRole('button', { name: 'Account' });

		expect(follows(search, report), 'report follows search').toBe(true);
		expect(follows(report, alerts), 'alerts follow the report').toBe(true);
		expect(follows(alerts, theme), 'the toggle follows the alerts').toBe(true);
		expect(follows(theme, account), 'the account is last').toBe(true);
	});

	it('carries the breadcrumbs on the left, before every control', () => {
		const first = shell.nav;
		const row = (typeof first === 'function' ? first(viewer) : first)
			.flatMap((e) => ('items' in e ? e.items : [e]))
			.at(0)!;
		route.url = new URL(`http://localhost${row.href}`);
		render(Layout, { props: { children } });

		const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
		expect(within(crumbs).getAllByRole('listitem').at(-1)).toHaveTextContent(row.label);
		expect(follows(crumbs, screen.getByTestId('ds-shell-search'))).toBe(true);
		expect(follows(crumbs, screen.getByRole('button', { name: 'Account' }))).toBe(true);
	});

	it("carries a detail page's own trail, the last crumb naming the page", () => {
		route.data = {
			breadcrumbs: [{ label: 'Things', href: '/things' }, { label: 'This one' }]
		};
		render(Layout, { props: { children } });

		const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
		expect(within(crumbs).getByRole('link', { name: 'Things' })).toHaveAttribute('href', '/things');
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This one');
	});

	it('names the last crumb from the page itself, as usePageTitle sets it', async () => {
		route.data = {
			breadcrumbs: [{ label: 'Things', href: '/things' }, { label: 'Thing' }]
		};
		const crumbs = () => screen.getByRole('navigation', { name: 'Breadcrumb' });
		const last = () => within(crumbs()).getAllByRole('listitem').at(-1)!;
		const { unmount } = render(Layout, { props: { children } });
		expect(last()).toHaveTextContent('Thing');

		const page = render(TitledPage, { props: { name: 'Mq 28a' } });
		await tick();
		expect(last()).toHaveTextContent('Mq 28a');
		expect(within(crumbs()).getByRole('link', { name: 'Things' })).toHaveAttribute(
			'href',
			'/things'
		);

		page.unmount();
		await tick();
		expect(last()).toHaveTextContent('Thing');
		unmount();
	});

	it('carries no page title: one hidden heading names the page', () => {
		route.data = { title: 'A page' };
		render(Layout, { props: { children } });

		const headings = screen.getAllByRole('heading', { level: 1 });
		expect(headings).toHaveLength(1);
		expect(headings[0]).toHaveClass('sr-only');
	});
});

describe('the sidebar', () => {
	it('carries its toggle on its top, before the nav, and the bar does not', async () => {
		render(Layout, { props: { children } });
		const rail = document.querySelector('.ds-shell-rail')!;
		const toggle = screen.getByTestId('ds-rail-collapse');

		expect(rail.firstElementChild).toContainElement(toggle);
		expect(follows(toggle, rail.querySelector('nav')!)).toBe(true);
		expect(document.querySelector('header')).not.toContainElement(toggle);

		// It folds an open rail and opens a folded one: the app may declare
		// `railCollapsed`, so the test reads the state it starts in.
		const startsCollapsed = shell.railCollapsed ?? false;
		expect(rail.hasAttribute('data-collapsed')).toBe(startsCollapsed);
		await fireEvent.click(toggle);
		expect(rail.hasAttribute('data-collapsed')).toBe(!startsCollapsed);
	});

	it('draws the nav the app declared', () => {
		render(Layout, { props: { children } });
		const nav = typeof shell.nav === 'function' ? shell.nav(viewer) : shell.nav;
		const labels = nav.flatMap((e) => ('items' in e ? e.items : [e])).map((i) => i.label);
		const rail = within(document.querySelector<HTMLElement>('.ds-shell-rail')!);
		for (const label of labels) {
			expect(rail.getAllByText(label).length, label).toBeGreaterThan(0);
		}
	});
});

describe('the account menu', () => {
	it('opens on Settings, and carries no Settings row in the sidebar', async () => {
		render(Layout, { props: { children } });
		const rail = document.querySelector<HTMLElement>('.ds-shell-rail')!;
		expect(within(rail).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Account' }));
		expect(await screen.findByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
	});
});

describe('the palette', () => {
	it("lists the account menu's commands beside the nav", async () => {
		render(Layout, { props: { children } });
		await fireEvent.click(screen.getByTestId('ds-shell-search'));

		const palette = within(await screen.findByRole('dialog'));
		expect(palette.getByText('Settings')).toBeInTheDocument();
		expect(palette.getByText('Sign out')).toBeInTheDocument();
	});

	it('asks the chat persona what was typed, on Enter', async () => {
		render(Layout, { props: { children } });
		await fireEvent.click(screen.getByTestId('ds-shell-search'));

		const palette = within(await screen.findByRole('dialog'));
		await fireEvent.input(palette.getByRole('combobox'), { target: { value: 'what is owed?' } });
		const row = await palette.findByText('Ask Milton: what is owed?');
		await fireEvent.click(row);
		expect(chat.handOff).toHaveBeenCalledWith('milton', { ask: 'what is owed?' });
	});

	it('lists a nav section’s children under the section’s name', async () => {
		const nav = typeof shell.nav === 'function' ? shell.nav(viewer) : shell.nav;
		const parents = nav
			.flatMap((e) => ('items' in e ? e.items : [e]))
			.filter((item) => item.children?.length);
		render(Layout, { props: { children } });
		await fireEvent.click(screen.getByTestId('ds-shell-search'));

		const palette = within(await screen.findByRole('dialog'));
		for (const parent of parents) {
			for (const child of parent.children!.filter((c) => c.href !== parent.href)) {
				expect(palette.getByText(`${parent.label} · ${child.label}`)).toBeInTheDocument();
			}
		}
	});
});

describe('the page types', () => {
	// What a route declares in its load data is what the shell lays out; no page
	// type draws a title, and a route that declares nothing is a reading page.
	const frames = PAGE_TYPES.filter((type) => type !== 'bare');

	it('is a reading page when the route declares nothing', () => {
		render(Layout, { props: { children } });
		expect(screen.getByTestId('the-page').closest('.ds-page')).toHaveAttribute(
			'data-page',
			'reading'
		);
	});

	for (const type of frames) {
		it(`lays a ${type} page out in the ${type} frame, inside the one main`, () => {
			route.data = { pageType: type };
			render(Layout, { props: { children } });

			const page = screen.getByTestId('the-page');
			expect(page.parentElement).toHaveClass('ds-page-main');
			expect(page.closest('.ds-page')).toHaveAttribute('data-page', type);
			expect(screen.getByRole('main')).toContainElement(page);
		});
	}

	it('draws no shell at all for a bare page', () => {
		route.data = { pageType: 'bare' };
		render(Layout, { props: { children } });

		expect(screen.getByTestId('the-page')).toBeInTheDocument();
		expect(document.querySelector('.ds-shell')).toBeNull();
		expect(screen.queryByTestId('ds-shell-search')).not.toBeInTheDocument();
	});
});
