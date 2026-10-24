/**
 * Behaviour proof for the settings destination
 * (rules-library/core/verification.md §"Behaviour vs Appearance").
 *
 * The claims here are about what is in the accessibility tree and which row is
 * marked as the page, because that is what a reader and a screen reader
 * actually get. The pane's GEOMETRY (its width, its own scroller, flush against
 * the rail) belongs to the page type and is measured with a real layout in
 * `harness/drive.mjs`; jsdom has no layout and would pass on a collapsed column.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Harness from './settings-shell.svelte';
import SettingsShell from '$lib/components/ui/settings-shell/settings-shell.svelte';
import { windowWidth } from './window-width.js';

beforeEach(() => windowWidth(100));

const list = () => screen.getByRole('navigation', { name: 'Settings sections' });

describe('SettingsShell — the section list', () => {
	it('renders each group behind its own eyebrow, in source order', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		const nav = list();

		// The eyebrow is the package's own nav-group heading, so a settings group
		// and a rail group are the same treatment rather than two near-copies.
		const headings = [...nav.querySelectorAll('.ds-nav-heading')].map((h) => h.textContent);
		expect(headings).toEqual(['This company', 'About']);
	});

	it('drops a group with no sections rather than stubbing a row that leads nowhere', () => {
		// The app has no personal settings yet. It leaves the group in its list;
		// `toGroups` drops it, so nothing renders and nothing has to be commented
		// out and remembered later.
		render(Harness, { props: { currentPath: '/settings/users', personal: false } });
		expect([...list().querySelectorAll('.ds-nav-heading')].map((h) => h.textContent)).not.toContain(
			'Yours'
		);
	});

	it('renders the personal group the moment it has a section', () => {
		render(Harness, { props: { currentPath: '/settings/users', personal: true } });
		expect([...list().querySelectorAll('.ds-nav-heading')].map((h) => h.textContent)).toEqual([
			'Yours',
			'This company',
			'About'
		]);
		expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
			'href',
			'/settings/profile'
		);
	});

	it('marks the current row as the page, and only that row', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		const current = [...list().querySelectorAll('a[aria-current="page"]')];
		expect(current.map((a) => a.getAttribute('href'))).toEqual(['/settings/users']);
	});

	it('reads the active row as the rail does — the leading edge, not colour alone', () => {
		// WCAG 1.4.1: the tint and weight are colour and would be all a
		// colour-blind reader got. The edge bar is the redundant signal, and it is
		// the rail's own element rather than a second one drawn here.
		render(Harness, { props: { currentPath: '/settings/users' } });
		const row = list().querySelector('a[aria-current="page"]');
		expect(row).toHaveAttribute('data-active', 'true');
		expect(row?.querySelector('.ds-nav-indicator')).toBeInTheDocument();
	});

	it('keeps the section lit on a page beneath it', () => {
		render(Harness, { props: { currentPath: '/settings/users/new' } });
		expect(
			[...list().querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute('href'))
		).toEqual(['/settings/users']);
	});

	it('does not light a section on a path that merely starts with its name', () => {
		// The segment boundary `matchesPrefix` enforces. Without it
		// `/settings/users-archive` would light Users, and a reader would be told
		// they are somewhere they are not.
		render(Harness, { props: { currentPath: '/settings/users-archive' } });
		expect(list().querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
	});

	it('carries no "Settings" heading of its own', () => {
		// The shell's bar names the section (2026.9.16). A heading here is the
		// same word twice, one above the other.
		render(Harness, { props: { currentPath: '/settings/users' } });
		expect(
			[...list().querySelectorAll('.ds-nav-heading')].map((h) => h.textContent?.toLowerCase())
		).not.toContain('settings');
	});

});

describe('SettingsShell — the panel page', () => {
	it('puts the sections in the pane, before the content', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		const pane = document.querySelector('.ds-page-pane');
		expect(pane).toBeInTheDocument();
		expect(pane).toContainElement(list());
		expect(list()).toHaveAccessibleName('Settings sections');
		expect(pane?.nextElementSibling).toHaveAttribute('data-slot', 'page-main');
	});

	it('writes no root element, width or scroller of its own', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		expect(document.querySelector('[class*="ds-settings"]')).toBeNull();
		const main = document.querySelector('[data-slot="page-main"]')!;
		expect(main.textContent).toContain('Who can sign in');
		expect(main.querySelector('nav')).toBeNull();
	});

	it('names where the reader is in the bar, the rail having no row for Settings', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent('Settings › Users');
	});

	it('names the destination alone on a path that is no section', () => {
		render(Harness, { props: { currentPath: '/settings/users-archive' } });
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent(/^\s*Settings\s*$/);
	});
});

describe('SettingsShell — below 64rem', () => {
	it('moves the sections to a sheet opened from the bar, headed and closable', async () => {
		windowWidth(50);
		render(Harness, { props: { currentPath: '/settings/users' } });
		expect(document.querySelector('.ds-page-pane')).toBeNull();

		await fireEvent.click(screen.getByTestId('ds-page-pane-open'));

		const sheet = await screen.findByRole('dialog');
		expect(within(sheet).getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
		expect(within(sheet).getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
		await fireEvent.click(within(sheet).getByRole('button', { name: 'Close Settings' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('carries no sheet head in the column', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		expect(screen.queryByRole('button', { name: 'Close Settings' })).toBeNull();
	});
});

describe('SettingsShell — with no shell', () => {
	// A desktop window or an element has no AppShell to host the pane, so the
	// destination draws the same panel frame itself rather than stacking.
	it('draws the panel frame in place: the sections in its pane, the section beside it', () => {
		render(SettingsShell, {
			props: {
				sections: [{ items: [{ label: 'Users', href: '/settings/users' }] }],
				currentPath: '/settings/users',
				children: createRawSnippet(() => ({ render: () => '<p>Who can sign in</p>' }))
			}
		});
		const frame = document.querySelector('.ds-page[data-page="panel"]');
		expect(frame).not.toBeNull();
		expect(frame!.querySelector('.ds-page-pane')).toContainElement(list());
		expect(frame!.querySelector('.ds-page-main')?.textContent).toContain('Who can sign in');
	});
});
