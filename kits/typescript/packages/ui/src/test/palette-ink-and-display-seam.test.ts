/**
 * A primitive never sets text below the ink the palette chose, and the display
 * face's case and tracking are the palette's to say (caspo, 12/10/2026). jsdom
 * does not resolve the cascade, so the claims are held at their source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatList from '$lib/components/ui/stat-list/stat-list.svelte';

const lib = join(__dirname, '../lib');
const read = (p: string) => readFileSync(join(lib, p), 'utf8');

describe('muted text keeps the palette ink', () => {
	it('StatList paints a muted value in the muted ink itself', () => {
		render(StatList, { title: 'T', items: [{ label: 'Cold', value: 0, muted: true }] });
		const value = screen.getByText('0');
		expect(value.className).toContain('text-muted-foreground');
		expect(value.className).not.toMatch(/text-muted-foreground\/\d/);
	});

	it('the nav group heading is the muted nav ink, undimmed', () => {
		const rule = read('styles.css').match(/\.ds-nav-heading \{[^}]*\}/s)?.[0] ?? '';
		expect(rule).toContain('color: var(--ds-nav-ink-muted);');
	});
});

describe('the display face is set by the palette', () => {
	it('.font-display and .ds-prose read the case and tracking tokens, defaulting to inherit', () => {
		const css = read('styles.css');
		expect(css).toMatch(/\.font-display \{[^}]*text-transform: var\(--ds-font-display-transform, inherit\)/s);
		expect(css).toMatch(/\.font-display \{[^}]*letter-spacing: var\(--ds-font-display-tracking, inherit\)/s);
		expect(css).toMatch(/\.ds-prose h4 \{[^}]*--ds-font-display-transform/s);
	});

	it.each([
		'components/ui/app-dialog/app-dialog.svelte',
		'components/ui/app-shell/app-shell.svelte',
		'components/ui/list-shell/list-shell.svelte',
		'components/ui/page-header/page-header.svelte'
	])('%s tracks its display title through the token', (file) => {
		expect(read(file)).toContain('tracking-[var(--ds-font-display-tracking,');
	});
});
