/**
 * Gate: the density option, and the promise that turning it on is the only way
 * anything moves.
 *
 * The defect it closes is not a broken pixel — it is a missing knob. Button's
 * heights were hard-coded Tailwind classes (`h-10`, `size-10`, `px-4`), so no
 * token could reach them and an app whose controls run denser than 40px had one
 * option: fork the component. One did, and took `dialog`, `alert-dialog`,
 * `command`, `input-group` and `form` with it, five of them identical to this
 * package's but for which Button they import. A geometry decision with no knob
 * is a fork of everything downstream of it.
 *
 * Two claims, and the second matters more than the first:
 *
 *   1. every rung of the ramp resolves through a `--ds-control-*` token, so
 *      `[data-ds-density='compact']` reaches all of it;
 *   2. the DEFAULT resolves to the exact lengths the hard-coded classes did.
 *      2.5rem is h-10, 2.25rem is h-9, 1rem is px-4, and so on. A consumer that
 *      names no density must render to the same pixel, and the numbers below are
 *      transcribed from the classes this change replaced rather than from the
 *      values it introduced — so a "tidy-up" of the ramp fails here.
 *
 * `harness/drive.mjs` carries the same claim in resolved pixels against a real
 * engine, which is the only place a `var()` chain is actually evaluated; this
 * gate is the one that runs in seconds on every commit.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, declaration, distDir } from './tailwind-probe';

/** The four rungs, and the class each token's default has to reproduce. */
const COMFORTABLE: Record<string, string> = {
	'--ds-control-height-xs': '1.75rem', // h-7
	'--ds-control-height-sm': '2.25rem', // h-9
	'--ds-control-height-md': '2.5rem', // h-10
	'--ds-control-height-lg': '2.75rem', // h-11
	'--ds-control-pad-xs': '0.625rem', // px-2.5
	'--ds-control-pad-sm': '0.875rem', // px-3.5
	'--ds-control-pad-md': '1rem', // px-4
	'--ds-control-pad-lg': '1.25rem', // px-5
	'--ds-control-pad-icon-xs': '0.375rem', // pr-1.5 / pl-1.5
	'--ds-control-pad-icon-sm': '0.5rem', // pr-2 / pl-2
	'--ds-control-pad-icon-md': '0.75rem', // pr-3 / pl-3
	'--ds-control-pad-icon-lg': '0.75rem' // pr-3 / pl-3
};

/** The shipped dense preset. `md`/`sm` land on Input's `h-8` and Select's `h-7`. */
const COMPACT: Record<string, string> = {
	'--ds-control-height-xs': '1.5rem',
	'--ds-control-height-sm': '1.75rem',
	'--ds-control-height-md': '2rem',
	'--ds-control-height-lg': '2.25rem',
	'--ds-control-pad-xs': '0.5rem',
	'--ds-control-pad-sm': '0.625rem',
	'--ds-control-pad-md': '0.75rem',
	'--ds-control-pad-lg': '1rem',
	'--ds-control-pad-icon-xs': '0.25rem',
	'--ds-control-pad-icon-sm': '0.375rem',
	'--ds-control-pad-icon-md': '0.5rem',
	'--ds-control-pad-icon-lg': '0.625rem'
};

const stylesheet = readFileSync(join(distDir, 'styles.css'), 'utf8');
const buttonSource = readFileSync(
	join(distDir, 'components', 'ui', 'button', 'button.svelte'),
	'utf8'
);

/** The declarations inside the first rule whose selector text matches. */
function ruleBody(css: string, selectorFragment: string): string {
	const at = css.indexOf(selectorFragment);
	expect(at, `no rule matching ${selectorFragment}`).toBeGreaterThan(-1);
	const open = css.indexOf('{', at);
	return css.slice(open + 1, css.indexOf('}', open));
}

describe('the control geometry tokens', () => {
	it('default to the exact lengths the hard-coded classes produced', () => {
		// Read out of the COMPILED stylesheet, not the source: a later @theme key
		// or a layer could in principle shadow a :root declaration, and the value
		// a consumer gets is the one that survives the compile.
		const body = ruleBody(compile([]), ":root, [data-ds-density='comfortable']");
		const wrong = Object.entries(COMFORTABLE)
			.filter(([name, expected]) => !new RegExp(`${name}:\\s*${expected}\\s*;`).test(body))
			.map(([name, expected]) => `${name} is not ${expected} by default`);

		expect(wrong, 'control tokens whose default is not the class it replaced').toEqual([]);
	});

	it('ships a compact preset that moves every rung', () => {
		const body = ruleBody(stylesheet, "[data-ds-density='compact']");
		const wrong = Object.entries(COMPACT)
			.filter(([name, expected]) => !new RegExp(`${name}:\\s*${expected}\\s*;`).test(body))
			.map(([name, expected]) => `${name} is not ${expected} under compact`);

		expect(wrong, 'rungs the compact preset does not move').toEqual([]);
		// Every rung, not most of them: a preset that moves the heights and leaves
		// the padding behind gives a squat button with comfortable side room, which
		// looks like a bug rather than a density.
		expect(Object.keys(COMPACT).length).toBe(Object.keys(COMFORTABLE).length);
	});

	it('lets a comfortable subtree sit inside a compact page', () => {
		// The escape hatch has to exist and has to carry the whole ramp, or a dense
		// app can never render one ordinary control row.
		const body = ruleBody(stylesheet, "[data-ds-density='comfortable']");
		for (const [name, expected] of Object.entries(COMFORTABLE)) {
			expect(body, `${name} missing from the comfortable rule`).toMatch(
				new RegExp(`${name}:\\s*${expected}\\s*;`)
			);
		}
	});

	it('declares the density rules AFTER :root, so a page-level attribute wins', () => {
		// Both selectors carry the same specificity, so this is decided purely by
		// source order — which means it is decided silently, and a reordering
		// would leave `data-ds-density="compact"` on <html> doing nothing at all.
		const rootOnly = stylesheet.indexOf('--ds-control-height-md');
		const compactAt = stylesheet.indexOf("[data-ds-density='compact']");
		expect(rootOnly).toBeGreaterThan(-1);
		expect(compactAt).toBeGreaterThan(rootOnly);
	});
});

describe('the button size ramp', () => {
	it('reaches every rung through a token, never a hard-coded class', () => {
		// The regression this refuses: someone types `h-10` back in because it is
		// shorter. It compiles, it looks right, and the density option quietly
		// stops reaching that one size.
		//
		// Scoped to the `size:` table and with the SVG sizing stripped first. An
		// icon's own `size-4` is not control geometry — it is how big the glyph
		// inside the control is drawn, and it has no business following a density.
		const table = /size:\s*\{([\s\S]*?)\n\t\t\t\}/.exec(buttonSource)?.[1];
		expect(table, 'could not find the size table in the built button').toBeTruthy();
		const geometry = (table as string)
			.replace(/\[&_svg[\s\S]*?\]:size-[0-9]+/g, '')
			.replace(/\/\/.*$/gm, '');

		const offenders = [
			...geometry.matchAll(/\b((?:h|size|px|pr|pl)-[0-9]+(?:\.[0-9]+)?)\b/g)
		].map(([, utility]) => utility);

		expect(offenders, 'hard-coded geometry classes in the button size table').toEqual([]);
	});

	it('names a real token in every size, and the icon sizes track the same heights', () => {
		for (const rung of ['xs', 'sm', 'md', 'lg']) {
			expect(buttonSource).toContain(`h-(--ds-control-height-${rung})`);
			expect(buttonSource).toContain(`px-(--ds-control-pad-${rung})`);
			expect(buttonSource).toContain(`pr-(--ds-control-pad-icon-${rung})`);
			expect(buttonSource).toContain(`pl-(--ds-control-pad-icon-${rung})`);
		}
		// `icon`, `icon-xs`, `icon-sm`, `icon-lg` — a square of the same height, so
		// an icon button and a text button in one row cannot disagree.
		for (const rung of ['xs', 'sm', 'md', 'lg']) {
			expect(buttonSource).toContain(`size-(--ds-control-height-${rung})`);
		}
	});

	it('compiles those utilities to real declarations', () => {
		// The other half of the #3 lesson: a class naming a token still has to be
		// a class Tailwind emits. `h-(--x)` is valid; `h-[--x]` is not.
		const css = compile([
			'h-(--ds-control-height-md)',
			'size-(--ds-control-height-md)',
			'px-(--ds-control-pad-md)',
			'pr-(--ds-control-pad-icon-md)'
		]);
		expect(declaration(css, 'h-\\(--ds-control-height-md\\)', 'height')).toBe(
			'var(--ds-control-height-md)'
		);
		expect(declaration(css, 'px-\\(--ds-control-pad-md\\)', 'padding-inline')).toBe(
			'var(--ds-control-pad-md)'
		);
		expect(declaration(css, 'pr-\\(--ds-control-pad-icon-md\\)', 'padding-right')).toBe(
			'var(--ds-control-pad-icon-md)'
		);
		expect(css).toMatch(/\.size-\\\(--ds-control-height-md\\\)\s*\{[^}]*width:\s*var\(--ds-control-height-md\)/);
	});
});
