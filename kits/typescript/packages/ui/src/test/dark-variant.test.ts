/**
 * Gate: the `dark:` variant this package's components are written against must
 * be supplied BY THIS PACKAGE, not assumed of the app.
 *
 * The defect this makes loud is the same shape as the dead-colour-utility one
 * (#3), one layer up. Tailwind v4 resolves a bare `dark:` against
 * `prefers-color-scheme`; the estate uses the CLASS strategy. So in an app that
 * has not declared `@custom-variant dark`, every `dark:` utility this package
 * ships compiles into a media query that the app's theme switch cannot reach:
 * the palette flips (that is a plain `.dark {}` block in the token package and
 * needs no variant), and the components' dark refinements silently do not —
 * a theme toggle whose own icon never changes, which is exactly how this was
 * found, in a real browser, after jsdom and every existing gate passed.
 *
 * The check compiles the built package the way a consuming app does — WITHOUT
 * the app's own variant declaration — and asserts a real `dark:` utility from
 * the package lands under a class selector rather than a media query.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, distDir } from './tailwind-probe';

/**
 * The rule text Tailwind emits for `candidate`, class-escaped, or null.
 *
 * Brace-matched rather than `[^}]*`, because a custom variant is emitted as
 * NESTED css — `.dark\:hidden { &:is(.dark *) { display: none } }` — so a
 * non-nesting pattern stops at the inner block's closing brace and reports the
 * variant selector missing from the very rule that carries it.
 */
function ruleBlock(css: string, candidate: string): string | null {
	// A class name in the output is CSS-escaped — `dark:hidden` is written
	// `.dark\:hidden` — so each non-word character is matched with an OPTIONAL
	// preceding backslash. Regex-escaping the candidate alone silently matches
	// nothing and reads as "the utility generated no rule", which is the wrong
	// diagnosis for the right symptom.
	const pattern = [...candidate]
		.map((char) => (/[\w-]/.test(char) ? char : `\\\\?\\${char}`))
		.join('');
	const start = new RegExp(`\\.${pattern}\\s*\\{`).exec(css);
	if (!start) return null;
	let depth = 0;
	for (let i = start.index; i < css.length; i += 1) {
		if (css[i] === '{') depth += 1;
		else if (css[i] === '}') {
			depth -= 1;
			if (depth === 0) return css.slice(start.index, i + 1);
		}
	}
	return null;
}

describe('the class-based dark variant', () => {
	it('is declared by the shipped stylesheet, not left to the app', () => {
		const stylesheet = readFileSync(join(distDir, 'styles.css'), 'utf8');
		expect(stylesheet).toMatch(/@custom-variant\s+dark\s*\(&:is\(\.dark \*\)\)/);
	});

	it('makes a dark: utility resolve against the class, not the OS preference', () => {
		const css = compile(['dark:hidden', 'dark:block']);

		// The emitted selector is what separates the two worlds: `:is(.dark *)`
		// is reachable by a theme switch, `@media (prefers-color-scheme: dark)`
		// is not.
		for (const candidate of ['dark:hidden', 'dark:block']) {
			const block = ruleBlock(css, candidate);
			expect(block, `${candidate} generated no rule at all`).not.toBeNull();
			expect(block).toContain(':is(.dark *)');
		}
		expect(css).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
	});

	it('covers every dark: utility the built package actually ships', () => {
		// A variant that resolved for one utility and not another would be worse
		// than none at all, so the whole shipped surface is compiled at once.
		const candidates = new Set<string>();
		for (const file of walkSvelte(distDir)) {
			for (const word of readFileSync(file, 'utf8').split(/[\s"'`{}();,]+/)) {
				if (/^dark:[a-z0-9[\]/.:_-]+$/.test(word) && !word.endsWith(':')) candidates.add(word);
			}
		}
		expect(candidates.size, 'no dark: utilities found — the extractor is broken').toBeGreaterThan(
			10
		);

		const css = compile([...candidates]);
		const unreachable = [...candidates].filter((candidate) => {
			const block = ruleBlock(css, candidate);
			return block !== null && !block.includes(':is(.dark *)');
		});
		expect(unreachable, 'dark: utilities that a class-based theme switch cannot reach').toEqual([]);
	});
});

function walkSvelte(dir: string): string[] {
	const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walkSvelte(full));
		else if (full.endsWith('.svelte')) out.push(full);
	}
	return out;
}
