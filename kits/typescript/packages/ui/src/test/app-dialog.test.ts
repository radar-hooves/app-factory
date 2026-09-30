/**
 * `AppDialog`'s width scale.
 *
 * Three sizes was one adopter's whole reason for keeping a local dialogue frame:
 * it had five, and a component that offers a subset of the widths an app needs
 * is a component the app cannot adopt. The scale therefore grew at its ENDS —
 * `sm`/`md`/`lg` still mean exactly what they meant, so no existing call site
 * moves — and this pins both halves of that promise.
 *
 * The second describe is the one that would have caught a typo. A width class
 * that resolves to nothing is the #3 defect shape all over again: the class is
 * in the DOM, the dialogue renders, and it is simply the wrong width. Only the
 * real compiler can tell a live `max-w-5xl` from a dead one, so the five are
 * compiled and required to be five DISTINCT, real container values.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AppDialogHarness from './app-dialog.svelte';
import { compile, declaration } from './tailwind-probe';

const SIZES = {
	xs: 'sm:max-w-sm',
	sm: 'sm:max-w-md',
	md: 'sm:max-w-xl',
	lg: 'sm:max-w-3xl',
	xl: 'sm:max-w-5xl'
} as const;

/** The rendered dialogue frame. */
function content(): HTMLElement {
	const el = document.querySelector('[data-slot="dialog-content"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

describe('AppDialog size', () => {
	for (const [size, expected] of Object.entries(SIZES)) {
		it(`maps size="${size}" onto ${expected}`, () => {
			render(AppDialogHarness, { props: { size: size as keyof typeof SIZES } });
			expect(content().className).toContain(expected);
		});
	}

	it('defaults to md, so an omitted size is the middle of the scale', () => {
		render(AppDialogHarness);
		expect(content().className).toContain(SIZES.md);
	});

	it('keeps every size full-bleed below the sm breakpoint', () => {
		// A phone has one width. Every entry in the scale is behind `sm:` for that
		// reason, and an unprefixed t-shirt cap slipping in would pin a dialogue to
		// 24rem on a 320px screen with dead margin either side. The only unprefixed
		// cap allowed is the viewport-relative one the frame always carries.
		for (const size of Object.keys(SIZES) as (keyof typeof SIZES)[]) {
			render(AppDialogHarness, { props: { size } });
			const unprefixed = content()
				.className.split(/\s+/)
				.filter((c) => /^max-w-/.test(c));
			expect(unprefixed).toEqual(['max-w-[calc(100%-2rem)]']);
		}
	});
});

describe('the width scale in a consuming app', () => {
	it('resolves to five real, distinct container widths', () => {
		const utilities = Object.values(SIZES);
		// Compiled unprefixed: a `sm:` rule is emitted under its escaped name
		// inside a media query, and the claim here is about the WIDTH each size
		// resolves to, not about the breakpoint wrapper the previous test pins.
		const bareUtilities = utilities.map((utility) => utility.replace('sm:', ''));
		const css = compile(bareUtilities);

		const resolved = bareUtilities.map((bare) => {
			const value = declaration(css, bare, 'max-width');
			expect(value, `${bare} generated no max-width at all`).not.toBeNull();
			return value;
		});

		// Every one comes off the container scale, not the spacing scale — the
		// collision `tailwind-namespace.test.ts` exists to stop, checked here on
		// the specific utilities this component depends on.
		for (const value of resolved) expect(value).toMatch(/^var\(--container-/);
		// Five sizes that resolve to fewer than five widths is a scale with a
		// duplicate in it: the API would offer a choice that changes nothing.
		expect(new Set(resolved).size).toBe(bareUtilities.length);
	});
});
