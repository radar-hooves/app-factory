/**
 * Gate: on paper the shell steps out of the way (app-factory#37), and the
 * search affordance's kbd reads off the chrome tokens, not the page (#38).
 * Structural only; the printed result is read in a real engine.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { distDir, packageRoot } from './tailwind-probe';

const css = readFileSync(join(distDir, 'styles.css'), 'utf8');
const printBlock = css.slice(css.indexOf('@media print'));

describe('print', () => {
	it('hides the chrome and unclips the scroller', () => {
		expect(css).toContain('@media print');
		for (const s of ['.ds-shell-rail', '.ds-shell-bar', '.ds-skip-link']) expect(printBlock).toContain(s);
		expect(printBlock).toMatch(/height:\s*auto\s*!important/);
		expect(printBlock).toMatch(/overflow:\s*visible\s*!important/);
	});
});

describe('search kbd', () => {
	it('takes the shell tokens, never the page surface', () => {
		const src = readFileSync(join(packageRoot, 'src/lib/components/ui/app-shell/app-shell.svelte'), 'utf8');
		const kbd = src.slice(src.indexOf('<kbd'), src.indexOf('</kbd'));
		expect(kbd).toContain('bg-shell');
		expect(kbd).not.toContain('bg-background');
	});
});
