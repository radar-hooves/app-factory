/**
 * The content measure, in the environment that can fairly judge it.
 *
 * jsdom applies no stylesheet and has no layout engine, so it cannot see a
 * single thing this feature actually claims: `max-width` resolves to nothing
 * here, `ch` resolves to nothing, and `getBoundingClientRect()` returns zeroes
 * whatever the cap says. A test here that asserted "prose is narrower than
 * wide" would pass against a build where the stylesheet was never imported —
 * exactly the class of silent failure this package has been bitten by before.
 *
 * So this file proves only the DOM CONTRACT: which class and which attribute
 * the shell writes for each value, and — the load-bearing half — that a shell
 * which never mentions `measure` writes neither. The widths themselves are
 * measured in a real browser, in `harness/drive.mjs`, at 2560px, 1440px and
 * 360px.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ShellHarness from './app-shell.svelte';
import { SHELL_MEASURES } from '$lib/components/ui/app-shell/measure.js';

/** The box `measure` acts on: the shell's inner content container. */
function contentBox(container: HTMLElement): HTMLElement {
	const main = container.querySelector<HTMLElement>('[data-slot="app-shell-content"]');
	if (!main) throw new Error('the shell rendered no content region');
	return main.firstElementChild as HTMLElement;
}

/** Every attribute on an element, order-independent. */
function attributes(el: HTMLElement): Record<string, string> {
	return Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
}

describe('AppShell — the measure is additive', () => {
	// The guarantee the operator asked for, as a gate rather than a claim: no
	// consumer that omits `measure` may render one pixel differently. The pixel
	// half of that was also measured out of band — the shell was rendered on the
	// pre-change build and on this one and the content region's DOM and geometry
	// diffed at 2560/1440/360px, identical throughout (recorded in CHANGELOG.md).
	// This holds the half a test can hold permanently.
	it('writes no measure class and no measure attribute when the prop is never named', () => {
		const { container } = render(ShellHarness);
		const box = contentBox(container);

		expect(box.classList.contains('ds-shell-measure')).toBe(false);
		expect(box.hasAttribute('data-measure')).toBe(false);
		// Not passing by rendering nothing: the box is still the padded content
		// container it always was.
		expect(box.className).toContain('flex-1');
		expect(box.className).toContain('px-4');
	});

	it('treats measure="full" as indistinguishable from omitting it', () => {
		// `full` is the default, so the two paths must converge on the same DOM
		// rather than merely look similar. If they ever diverge, a consumer
		// adopting the scale and then deciding a page wants no cap would get
		// something subtly different from what they started with.
		const omitted = attributes(contentBox(render(ShellHarness).container));
		const explicit = attributes(
			contentBox(render(ShellHarness, { props: { measure: 'full' } }).container)
		);

		expect(explicit).toEqual(omitted);
	});

	it('treats a null measure as no measure, rather than half of one', () => {
		// The type forbids `null`, but a loosely-typed prop bag, a spread config
		// or a nullable route field still delivers it, and the two guards this
		// used to carry were asymmetric: Svelte omits an attribute whose value is
		// null while a class token under the same test survives, so the box came
		// out carrying `ds-shell-measure` with no `data-measure` and therefore no
		// rule. Visually harmless, but it is precisely the DOM contract the gate
		// above states, and a guarantee with a hole in it is not one.
		const { container } = render(ShellHarness, {
			props: { measure: null as unknown as undefined }
		});
		const box = contentBox(container);

		expect(box.classList.contains('ds-shell-measure')).toBe(false);
		expect(box.hasAttribute('data-measure')).toBe(false);
	});

	it('adds exactly one class and one attribute when a measure IS named', () => {
		// The size of the change, pinned. A future refactor that reached for a
		// second wrapper element or swapped the padding utilities out under
		// `measure` would be a behaviour change for consumers styling or querying
		// this box, and would fail here rather than in an app.
		const omitted = attributes(contentBox(render(ShellHarness).container));
		const capped = attributes(
			contentBox(render(ShellHarness, { props: { measure: 'page' } }).container)
		);

		expect(capped['data-measure']).toBe('page');
		// Class SETS, not the class string: `cn` emits the measure class where it
		// sits in the call rather than at the end, and where in the string it
		// lands is not a claim worth freezing. What it adds is.
		const added = capped.class.split(/\s+/).filter((c) => !omitted.class.split(/\s+/).includes(c));
		const removed = omitted.class
			.split(/\s+/)
			.filter((c) => !capped.class.split(/\s+/).includes(c));
		expect(added).toEqual(['ds-shell-measure']);
		expect(removed).toEqual([]);
		expect(Object.keys(capped).sort()).toEqual([...Object.keys(omitted), 'data-measure'].sort());
	});

	it('keeps the measure box and the padded box the same element', () => {
		// One element, not a cap wrapper around a padding wrapper. Two boxes would
		// put the padding outside the cap, changing what the number means, and
		// would break every consumer selector that reaches
		// `[data-slot="app-shell-content"] > *`.
		const { container } = render(ShellHarness, { props: { measure: 'wide' } });
		const main = container.querySelector<HTMLElement>('[data-slot="app-shell-content"]')!;

		expect(main.children).toHaveLength(1);
		const box = contentBox(container);
		expect(box.classList.contains('ds-shell-measure')).toBe(true);
		expect(box.className).toContain('px-4');
	});
});

describe('AppShell — the measure vocabulary', () => {
	it('renders the machinery for every capped tier', () => {
		for (const measure of SHELL_MEASURES.filter((m) => m !== 'full')) {
			const { container } = render(ShellHarness, { props: { measure } });
			const box = contentBox(container);
			expect(box.getAttribute('data-measure'), measure).toBe(measure);
			expect(box.classList.contains('ds-shell-measure'), measure).toBe(true);
		}
	});

	it('is a closed scale of four, narrowest first', () => {
		// The order is not decorative: the README documents the scale in it, and
		// the browser gate asserts the rendered widths increase along it. A value
		// added here without a rule in styles.css would render a class with
		// nothing behind it — the dead-utility failure this package gates for.
		expect([...SHELL_MEASURES]).toEqual(['prose', 'page', 'wide', 'full']);
	});
});
