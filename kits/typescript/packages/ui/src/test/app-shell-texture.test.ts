/**
 * The content texture, in the environment that can fairly judge it.
 *
 * jsdom applies no stylesheet, resolves no gradient and has no compositor, so it
 * cannot see one thing this feature actually claims: `background-image` comes
 * back empty here whatever the class says, `color-mix` never resolves,
 * `background-attachment` is not computed, and there is no scrolling to observe
 * the texture travel with. A test here asserting "the grid paints" would pass
 * against a build where the stylesheet was never imported — the silent failure
 * this package has been bitten by repeatedly.
 *
 * So this file proves only the DOM CONTRACT: which class and which attribute the
 * shell writes, on WHICH element, that it adds no box while doing it, and — the
 * load-bearing half — that `texture="none"` writes neither, so an app that must
 * opt out lands on a genuinely bare region. Whether the texture paints, sits
 * behind content, travels with the scroll and disappears on paper is measured in
 * a real browser, in `harness/drive.mjs`.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ShellHarness from './app-shell.svelte';
import { SHELL_TEXTURES } from '$lib/components/ui/app-shell/texture.js';

/** The box `texture` acts on: the shell's scrolling content region. */
function contentRegion(container: HTMLElement): HTMLElement {
	const main = container.querySelector<HTMLElement>('[data-slot="app-shell-content"]');
	if (!main) throw new Error('the shell rendered no content region');
	return main;
}

/** Every attribute on an element, order-independent. */
function attributes(el: HTMLElement): Record<string, string> {
	return Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
}

describe('AppShell — the texture is additive', () => {
	// The house atmosphere arrives without an app asking. It shipped opt-in so its
	// introduction moved nobody, and the estate's answer was that five of nine
	// apps wore it and three of those had hand-rolled their own copy — an opt-in
	// house style measures who remembered, not what the house looks like.
	it('paints the texture when the prop is never named', () => {
		const { container } = render(ShellHarness);
		const main = contentRegion(container);

		expect(main.classList.contains('ds-shell-texture')).toBe(true);
		expect(main.getAttribute('data-texture')).toBe('grid');
		// Still the scroller it always was, and still the element `measure`'s box
		// hangs off — the texture rides the region rather than replacing it.
		expect(main.className).toContain('overflow-y-auto');
		expect(main.className).toContain('relative');
	});

	it('treats texture="none" as a genuinely bare region', () => {
		// `none` is the opt-out, and it has to be complete: an app that turns the
		// texture off must land on the region as it was before the feature existed,
		// not on a class with a neutered rule behind it.
		const bare = attributes(
			contentRegion(render(ShellHarness, { props: { texture: 'none' } }).container)
		);

		expect(bare.class.split(/\s+/)).not.toContain('ds-shell-texture');
		expect(bare['data-texture']).toBeUndefined();
	});

	it('treats a null texture as no texture, rather than half of one', () => {
		// The type forbids `null`, but a loosely-typed prop bag, a spread config or
		// a nullable route field still delivers it — and unlike an omitted prop,
		// `null` does NOT fall back to the default. Svelte's two halves are
		// asymmetric: an attribute whose value is null is omitted while a class
		// token under the same test survives. Guarded once for `measure` (2026.8.3)
		// and the same shape here, because a class with no matching rule is exactly
		// the DOM contract the gate above states.
		const { container } = render(ShellHarness, {
			props: { texture: null as unknown as undefined }
		});
		const main = contentRegion(container);

		expect(main.classList.contains('ds-shell-texture')).toBe(false);
		expect(main.hasAttribute('data-texture')).toBe(false);
	});

	it('adds exactly one class and one attribute over the untextured region', () => {
		// The size of the change, pinned. A future refactor reaching for a wrapper
		// element, an overlay child or a swapped class would be a behaviour change
		// for consumers styling or querying this region, and fails here rather than
		// in an app. Measured against `none` rather than against an omitted prop,
		// because omitting it now yields the painted region.
		const omitted = attributes(
			contentRegion(render(ShellHarness, { props: { texture: 'none' } }).container)
		);
		const painted = attributes(
			contentRegion(render(ShellHarness, { props: { texture: 'grid' } }).container)
		);

		expect(painted['data-texture']).toBe('grid');
		// Class SETS, not the class string: `cn` emits the texture class where it
		// sits in the call rather than at the end, and where in the string it lands
		// is not a claim worth freezing. What it adds is.
		const added = painted.class.split(/\s+/).filter((c) => !omitted.class.split(/\s+/).includes(c));
		const removed = omitted.class
			.split(/\s+/)
			.filter((c) => !painted.class.split(/\s+/).includes(c));
		expect(added).toEqual(['ds-shell-texture']);
		expect(removed).toEqual([]);
		expect(Object.keys(painted).sort()).toEqual([...Object.keys(omitted), 'data-texture'].sort());
	});

	it('paints the texture without adding a box to the content region', () => {
		// The design claim, as a structural gate. Both apps that built this picture
		// first reached for an absolutely positioned child inside the scroller,
		// which paints above non-positioned content at `z-index: auto`, needs
		// excusing from hit-testing by hand, and is one more flex item in a column
		// that already fights for `min-height: 0`. A background layer has none of
		// those failure modes — and the way to keep it that way is to assert that
		// nothing was added.
		const bare = contentRegion(render(ShellHarness, { props: { texture: 'none' } }).container);
		const { container } = render(ShellHarness, { props: { texture: 'grid' } });
		const main = contentRegion(container);

		expect(main.children).toHaveLength(bare.children.length);
		expect(main.children).toHaveLength(1);
		expect(main.firstElementChild?.getAttribute('class')).toBe(
			bare.firstElementChild?.getAttribute('class')
		);
	});

	it('paints on the scrolling region, not on the measured content box', () => {
		// Which element carries it is the whole feature. The content box is capped
		// by `measure`, so a texture painted there would stop at the measure and
		// read as a stripe down the middle of the page rather than as the floor the
		// page sits on.
		const { container } = render(ShellHarness, {
			props: { texture: 'grid', measure: 'page' }
		});
		const main = contentRegion(container);
		const box = main.firstElementChild as HTMLElement;

		expect(main.classList.contains('ds-shell-texture')).toBe(true);
		expect(box.classList.contains('ds-shell-texture')).toBe(false);
		expect(box.hasAttribute('data-texture')).toBe(false);
		// The two props are independent: naming a texture must not disturb the
		// measure's own contract on the box below it.
		expect(box.getAttribute('data-measure')).toBe('page');
		expect(box.classList.contains('ds-shell-measure')).toBe(true);
	});

	it('composes with mainClass rather than replacing it', () => {
		// `mainClass` is the pre-existing seam on this element and stayed exactly
		// what it was. An app carrying its own class there must keep it, and must
		// keep it LAST, so a utility it wrote still wins the merge.
		const { container } = render(ShellHarness, {
			props: { texture: 'grid', mainClass: 'app-own-class' }
		});
		const main = contentRegion(container);
		const tokens = main.className.split(/\s+/);

		expect(tokens).toContain('ds-shell-texture');
		expect(tokens).toContain('app-own-class');
		expect(tokens.indexOf('app-own-class')).toBeGreaterThan(tokens.indexOf('ds-shell-texture'));
	});
});

describe('AppShell — the texture vocabulary', () => {
	it('renders the machinery for every painted texture', () => {
		for (const texture of SHELL_TEXTURES.filter((t) => t !== 'none')) {
			const { container } = render(ShellHarness, { props: { texture } });
			const main = contentRegion(container);
			expect(main.getAttribute('data-texture'), texture).toBe(texture);
			expect(main.classList.contains('ds-shell-texture'), texture).toBe(true);
		}
	});

	it('is a closed scale of two, the opt-out first', () => {
		// One picture, not a menu. The three apps that hand-rolled this texture wanted
		// the same picture and differed only on ink and pitch, which are custom
		// properties rather than names — a plain wash is
		// `--ds-shell-texture-grid-ink: transparent`, not a second value here. A
		// value added without a rule in styles.css would render a class with nothing
		// behind it, the dead-utility failure this package gates for everywhere else.
		// The order is the documentation order, not a default: `grid` is the default.
		expect([...SHELL_TEXTURES]).toEqual(['none', 'grid']);
	});
});
