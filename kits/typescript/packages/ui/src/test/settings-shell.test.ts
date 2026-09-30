/**
 * Behaviour proof for the settings destination
 * (rules-library/core/verification.md §"Behaviour vs Appearance").
 *
 * The claims here are about what is in the accessibility tree and which row is
 * marked as the page, because that is what a reader and a screen reader
 * actually get. The two-pane GEOMETRY — 240px, the independent scrollers, the
 * stack below md — is asserted against the compiled stylesheet at the bottom of
 * this file and measured with a real layout in `harness/drive.mjs`
 * (`?surface=settings`); jsdom has no layout and would pass on a collapsed
 * column.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Harness from './settings-shell.svelte';
import { distDir } from './tailwind-probe.js';

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

	it('renders the content pane beside the list', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		const pane = document.querySelector('.ds-settings-pane');
		expect(pane).toBeInTheDocument();
		expect(pane?.textContent).toContain('Who can sign in');
	});
});

describe('SettingsShell — the geometry, from the compiled stylesheet', () => {
	const css = readFileSync(join(distDir, 'styles.css'), 'utf8');
	const escape = (selector: string) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	/** The declarations of `selector` within `scope`, or null when the rule is absent. */
	function declarationsIn(scope: string, selector: string): string | null {
		const match = new RegExp(`${escape(selector)}\\s*\\{([^{}]*)\\}`).exec(scope);
		return match ? match[1] : null;
	}

	/** Brace-matched body of the at-rule starting at `at`. */
	function atRuleBody(at: number): string {
		let depth = 0;
		for (let i = css.indexOf('{', at); i < css.length; i += 1) {
			if (css[i] === '{') depth += 1;
			else if (css[i] === '}' && --depth === 0) return css.slice(at, i);
		}
		return '';
	}

	/** Every `@media` block, and the sheet with all of them removed. */
	const mediaBlocks = new Map<string, string>();
	let unconditional = css;
	for (const m of css.matchAll(/@media \(min-width: ([^)]+)\)/g)) {
		const body = atRuleBody(m.index);
		mediaBlocks.set(m[1], (mediaBlocks.get(m[1]) ?? '') + body);
		unconditional = unconditional.replace(body, '');
	}

	/** `selector`'s declarations outside every media query. */
	const rule = (selector: string) => declarationsIn(unconditional, selector);
	/** `selector`'s declarations inside `@media (min-width: <breakpoint>)`. */
	const inMediaQuery = (selector: string, breakpoint: string) =>
		declarationsIn(mediaBlocks.get(breakpoint) ?? '', selector);

	it('stacks below md and runs as two columns from md', () => {
		expect(rule('.ds-settings')).toContain('flex-direction: column');
		expect(inMediaQuery('.ds-settings', '48rem')).toContain('flex-direction: row');
	});

	it('bounds the panes only where they actually scroll', () => {
		// `min-height: 0` is what lets a pane shrink past its content and scroll.
		// Below md it is deliberately absent: the list stacks above the content and
		// the page scrolls as one, rather than two nested scrollers on a phone.
		expect(rule('.ds-settings')).not.toContain('min-height');
		expect(inMediaQuery('.ds-settings', '48rem')).toContain('min-height: 0');
		expect(inMediaQuery('.ds-settings-pane', '48rem')).toContain('overflow-y: auto');
	});

	it('stacks the pane’s sections on the package rhythm, without a wrapper', () => {
		// A settings page writes a run of Panels and no wrapper: the framing markup
		// this surface exists to stop a consumer writing.
		expect(rule('.ds-settings-pane > * + *')).toContain('margin-top: 1.25rem');
	});
});

describe('SettingsShell — the list element', () => {
	it('is the fixed column from md and a full-width band below it', () => {
		render(Harness, { props: { currentPath: '/settings/users' } });
		const classes = list().className.split(/\s+/);

		// 240px only from md; below it the list is the full width of the content
		// area, so an unprefixed width slipping in would pin it to 15rem on a
		// phone with dead space beside it.
		expect(classes.filter((c) => /^w-/.test(c))).toEqual([]);
		expect(classes).toContain('md:w-60');

		// The rule follows the axis: a bottom border when stacked, an inline-end
		// border when it is a column. `border-e` rather than `border-r` so it is on
		// the correct side in RTL.
		expect(classes).toContain('border-b');
		expect(classes).toContain('md:border-b-0');
		expect(classes).toContain('md:border-e');

		// AppNav declares `flex-1`; the list must not grow into the content pane.
		// tailwind-merge resolves the pair, so exactly one survives.
		expect(classes.filter((c) => /^flex-(1|auto|initial|none)$/.test(c))).toEqual(['flex-none']);
	});
});
