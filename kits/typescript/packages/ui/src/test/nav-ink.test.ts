/**
 * Gate: the shell's chrome may not paint TEXT in a colour the consumer owns (#11).
 *
 * The defect class, stated once so the next component that trips it is
 * recognisable: `--ds-color-primary` is the one token the package invites every
 * app to override, and the only constraint stated where an app picks it is that
 * it clear AA against its own `-foreground` pair — the FILL case. A shared
 * component that then consumes it as INK on its own chrome has invented a
 * second, stricter requirement and told nobody. An app can satisfy the
 * documented contract by a wide margin and fail the undocumented one badly:
 * measured in a real browser, a warm amber that is 7.69:1 as a fill was 1.90:1
 * as an active nav label, and a saturated blue that is 5:1 as a fill was 2.87:1.
 *
 * There are two gates for this, because they fail on different days.
 *
 * `harness/drive.mjs` is the one that measures: it drives the built package in
 * Chromium under three palettes and both themes, composites the real ancestor
 * stack, and asserts the actual ratio. It is the only place the claim can be
 * made honestly — jsdom applies no stylesheet and hands back the unresolved
 * `var(--…)` literal, and a compiled-CSS gate never resolves `color-mix()` over
 * a real surface.
 *
 * THIS file is the cheap structural guard that runs on every `pnpm test`: it
 * asserts the shipped stylesheet never routes a nav `color` back to `--primary`.
 * It cannot tell you a ratio, but it catches the one-character regression — a
 * future edit putting `var(--primary)` back — in milliseconds and without a
 * browser, and it names the reason at the point of failure.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { distDir, packageRoot, walk } from './tailwind-probe';

const stylesheet = readFileSync(join(distDir, 'styles.css'), 'utf8');

/** Every `selector { … }` rule in the shipped stylesheet, flattened. */
function rules(css: string): Array<{ selector: string; body: string }> {
	// Comments go first, and not for tidiness: this file is heavily commented,
	// and a comment sitting between two rules lands inside the NEXT rule's
	// selector capture — which silently turned every selector match below into a
	// miss on the first run of this gate.
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const found: Array<{ selector: string; body: string }> = [];
	// Declaration bodies only. A block containing a nested block (`@layer`,
	// `@media`) never matches, so its children are matched directly instead and
	// their at-rule wrapper drops out of the selector — which is what this gate
	// wants, since it asks what a rule declares, not where it is nested.
	for (const [, selector, body] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		found.push({ selector: selector.trim(), body });
	}
	return found;
}

/** The value of `property` in a declaration body, or null. */
function declared(body: string, property: string): string | null {
	const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`));
	return match ? match[1].trim() : null;
}

const NAV_RULE = /\.ds-(?:nav|shell)/;
/** The tokens an app redefines to carry its brand. None may become text here. */
const CONSUMER_BRAND = /var\(\s*--(?:primary|ds-color-primary|ring|ds-color-ring)\b/;
/** Properties that put a colour on GLYPHS. Backgrounds and borders are exempt. */
const INK_PROPERTIES = ['color', '-webkit-text-fill-color', 'text-decoration-color'];

describe('the shell chrome never paints text in the app’s brand token', () => {
	it('finds the nav rules at all (guards the parser itself)', () => {
		// A silent parser regression would make every assertion below vacuous —
		// the same trap `theme-coverage.test.ts` guards its extractor against.
		const navRules = rules(stylesheet).filter((rule) => NAV_RULE.test(rule.selector));
		expect(navRules.length).toBeGreaterThan(5);
		expect(navRules.map((rule) => rule.selector)).toContain(".ds-nav-item[data-active='true']");
	});

	it('routes no nav or chrome ink back to --primary', () => {
		const offenders = rules(stylesheet)
			.filter((rule) => NAV_RULE.test(rule.selector))
			.flatMap((rule) =>
				INK_PROPERTIES.map((property) => [rule.selector, property, declared(rule.body, property)] as const)
			)
			.filter(([, , value]) => value !== null && CONSUMER_BRAND.test(value))
			.map(([selector, property, value]) => `${selector} { ${property}: ${value} }`);

		expect(
			offenders,
			'chrome text painted in a token the app owns and was never told had to be legible as ink'
		).toEqual([]);
	});

	it('still paints the active row from the chrome ink, so the fix cannot be deleted to nothing', () => {
		// The mirror of the check above: dropping the declaration entirely would
		// also pass it, and would leave the active row indistinguishable from the
		// rest by ink. Colour is not the only active signal — weight, the tint and
		// the edge bar carry it too — but it is one of the three the harness
		// asserts as the redundancy that lets the brand bar stay undiluted.
		const active = rules(stylesheet).find(
			(rule) => rule.selector === ".ds-nav-item[data-active='true']"
		);
		expect(active, 'the active nav rule is gone').toBeDefined();
		expect(declared(active!.body, 'color')).toMatch(/var\(\s*--ds-nav-ink-active\s*,\s*var\(\s*--ds-nav-ink\s*\)\s*\)/);
		expect(declared(active!.body, 'font-weight')).toBe('500');
	});

	it('leaves the app an override that is a real affordance, not a dead one', () => {
		// --ds-nav-ink-active is how an app whose brand IS legible as ink puts it
		// back on the label knowingly. Read through a var() fallback rather than
		// declared with a default on purpose: declaring it at :root would resolve
		// where --ds-nav-ink does not exist and poison the property for everyone.
		expect(stylesheet).toContain('--ds-nav-ink-active');
		expect(stylesheet, '--ds-nav-ink-active must not be declared at :root').not.toMatch(
			/^\s*--ds-nav-ink-active\s*:/m
		);
	});

	it('reaches the chrome ink by a variable the nav reads, not one it redeclares', () => {
		// The cascade trap this closes: a custom property declared ON an element
		// beats one inherited INTO it, and `.ds-nav` is a descendant of every
		// chrome surface — so the chrome re-pointing `--ds-nav-ink` was overridden
		// by `.ds-nav`'s own declaration on the very element that consumes it. Both
		// declarations were individually correct; only their placement was wrong,
		// which is why nothing static could see it and the harness drives an
		// inverted chrome to prove the ink actually moves.
		const nav = rules(stylesheet).find((rule) => rule.selector === '.ds-nav');
		expect(nav, 'the .ds-nav ink defaults are gone').toBeDefined();
		expect(declared(nav!.body, '--ds-nav-ink')).toMatch(/var\(\s*--ds-nav-chrome-ink\s*,/);

		const chrome = rules(stylesheet).find((rule) => /\.ds-shell-rail/.test(rule.selector) && rule.body.includes('--ds-nav-chrome-ink'));
		expect(chrome, 'no chrome surface points --ds-nav-chrome-ink anywhere').toBeDefined();
		expect(declared(chrome!.body, '--ds-nav-chrome-ink')).toBe('var(--ds-shell-chrome-foreground)');
	});
});

describe('the shell components carry no brand-ink utility either', () => {
	it('uses no text-primary class in the shipped shell', () => {
		// The CSS gate above cannot see a Tailwind utility in a class string, and
		// `text-primary` is exactly the same defect wearing markup instead of CSS.
		// Scoped to the shell: the package uses `text-primary` elsewhere (link
		// variants, the eyebrow) where the colour is the point and the surface is
		// the page rather than the chrome — a separate call, tracked separately.
		const shellFiles = walk(distDir).filter((file) =>
			/[\\/](app-shell|command-palette)[\\/]/.test(file)
		);
		expect(shellFiles.length, 'no shell files found to check').toBeGreaterThan(0);

		const offenders = shellFiles
			.filter((file) => /[\s"'`]text-primary(?![a-z0-9-])/.test(readFileSync(file, 'utf8')))
			.map((file) => file.slice(packageRoot.length + 1));

		expect(offenders, 'shell components painting text in the app’s brand token').toEqual([]);
	});
});
