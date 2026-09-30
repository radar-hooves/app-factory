/**
 * Gate: nothing this package ships may reprice a standard Tailwind scale (#4).
 *
 * The failure: Tailwind resolves the sizing utilities (`w-*`, `max-w-*`,
 * `min-w-*`, `basis-*`) against `--spacing-*` BEFORE `--container-*`. Register
 * a named `--spacing-sm` for a padding affordance and `max-w-sm` silently stops
 * meaning 24rem and starts meaning 0.5rem — a text panel capped at 8px, one
 * word per line. Nothing fails: the class is real, the rule is real, only the
 * value is wrong.
 *
 * @poodle64/design-tokens carries the same guard over its own @theme block.
 * This one exists because that is no longer the whole shipped surface: this
 * package now ships its own stylesheet with its own @theme block, and a scale
 * key added there would collide identically while the token package's guard
 * stayed green. The collision has been independently rediscovered three times
 * across the estate and hand-patched locally each time; it must not be able to
 * return through the new door.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, declaration, distDir } from './tailwind-probe';

/**
 * The utilities Tailwind resolves against both `--spacing-*` and
 * `--container-*` — the entire surface a named spacing entry can capture.
 */
const SIZING_UTILITIES = [
	['max-w-xs', 'max-width'],
	['max-w-sm', 'max-width'],
	['max-w-md', 'max-width'],
	['max-w-lg', 'max-width'],
	['max-w-xl', 'max-width'],
	['max-w-2xl', 'max-width'],
	['w-xs', 'width'],
	['w-sm', 'width'],
	['w-2xl', 'width'],
	['min-w-xs', 'min-width'],
	['min-w-sm', 'min-width'],
	['min-w-2xl', 'min-width'],
	['basis-xs', 'flex-basis'],
	['basis-2xl', 'flex-basis']
] as const;

const stylesheet = readFileSync(join(distDir, 'styles.css'), 'utf8');

describe('the shipped design-system stylesheets', () => {
	it('leave every sizing utility meaning exactly what plain Tailwind means', () => {
		const names = SIZING_UTILITIES.map(([candidate]) => candidate);
		const withDesignSystem = compile(names);
		const plain = compile(names, { designSystem: false });

		for (const [candidate, property] of SIZING_UTILITIES) {
			const expected = declaration(plain, candidate, property);
			expect(expected, `baseline Tailwind emits no ${property} for .${candidate}`).not.toBeNull();
			expect(
				declaration(withDesignSystem, candidate, property),
				`.${candidate} changed meaning under the design-system import chain`
			).toBe(expected);
		}
	});

	it('resolve max-w-sm to the container scale, not a padding value', () => {
		// The concrete symptom from the report, asserted on the value rather than
		// on the absence of a key: an 8px cap is what a reader actually sees.
		const css = compile(['max-w-sm']);
		expect(declaration(css, 'max-w-sm', 'max-width')).toBe('var(--container-sm)');
		expect(css).toMatch(/--container-sm:\s*24rem;/);
	});

	it('register nothing in a namespace Tailwind already uses for a scale', () => {
		// Tailwind's own t-shirt-keyed namespaces. A named key in any of these
		// shadows a built-in scale the same way --spacing-sm shadows max-w-sm;
		// the spacing case is simply the one that has already bitten.
		const block = /@theme[^{]*\{([\s\S]*?)\n\}/g;
		const offenders: string[] = [];
		for (const [, body] of stylesheet.matchAll(block)) {
			for (const [, name] of body.matchAll(/^\s*(--(?:spacing|container|breakpoint)-[a-z0-9-]+)\s*:/gm)) {
				offenders.push(name);
			}
		}
		expect(offenders, 'a scale key in @poodle64/ui/styles.css shadows a Tailwind scale').toEqual(
			[]
		);
	});

	it('keep the named --ds-spacing-* rhythm available to hand-written CSS', () => {
		// The affordance was not deleted, it was rehomed: the named scale lives on
		// as --ds-spacing-*, outside every Tailwind namespace, so `p-md` losing its
		// utility form did not cost the vocabulary. Nothing in this package uses
		// the utility form, which is why rehoming was free.
		const css = compile(['p-4'], { extraCss: '@source "' + distDir + '";' });
		expect(css).toMatch(/--ds-spacing-md:\s*1rem;/);
		expect(declaration(css, 'p-4', 'padding')).toBe('calc(var(--spacing) * 4)');
	});

	it('carry no width utility that a consuming app would see collapse', () => {
		// This package's own components use max-w-xs/sm/md/xl. If any of them ever
		// resolves below its container value, the composed chrome collapses in
		// every consumer at once.
		const used = ['max-w-xs', 'max-w-sm', 'max-w-md', 'max-w-xl'];
		const css = compile(used);
		for (const candidate of used) {
			const value = declaration(css, candidate, 'max-width');
			expect(value, `${candidate} generated no max-width`).toBe(
				`var(--container-${candidate.replace('max-w-', '')})`
			);
		}
	});
});
