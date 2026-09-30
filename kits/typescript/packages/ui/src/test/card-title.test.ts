/**
 * `CardTitle`'s `level` prop: the escape hatch that lets a card title be a real
 * heading.
 *
 * The default is upstream shadcn's `<div>` and stays that way, so the risk this
 * file guards is not "does the heading render" — it is the two ways the feature
 * can be quietly wrong:
 *
 *   1. the default moves, breaking every consumer that never asked for a
 *      heading and every card that is correctly NOT one;
 *   2. the heading branch drifts from the div branch — a class, the slot
 *      marker or a rest prop present on one and not the other — which would
 *      make `level` a visual change as well as a semantic one, and the whole
 *      point is that it is not.
 *
 * Both are asserted against each other rather than against a copied-out class
 * string, so the pin cannot rot the next time the class list is edited.
 *
 * The third claim needs the real compiler. `<h1>`–`<h6>` carry UA font-size,
 * font-weight and margin that a `<div>` does not, so "identical class list"
 * only implies "identical rendering" if something neutralises them. The class
 * list itself handles size and weight (`text-base`, `font-medium`); MARGIN is
 * neutralised by Tailwind's preflight and by nothing in this package, so that
 * dependency is pinned here explicitly. jsdom cannot see any of it — it applies
 * no stylesheet — hence the compile. The real-browser leg is `harness/drive.md`
 * (`?surface=card`), where the two are measured against each other in an engine.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import CardTitleHarness from './card-title.svelte';
import { compile, customProperties, declaration, flatten } from './tailwind-probe';

const LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** The mounted title element, found by the marker every consumer sees. */
function title(): HTMLElement {
	const el = document.querySelector('[data-slot="card-title"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

describe('CardTitle default', () => {
	it('renders a div and contributes no heading, exactly as before', () => {
		render(CardTitleHarness);

		expect(title().tagName).toBe('DIV');
		// The point of the default: a card title that is not a heading must not
		// appear in the outline. Nothing in the whole card may.
		expect(screen.queryByRole('heading')).toBeNull();
		expect(screen.getByText('Estate summary')).toBeInTheDocument();
	});
});

describe('CardTitle level', () => {
	for (const level of LEVELS) {
		it(`renders a real h${level} at level ${level}`, () => {
			render(CardTitleHarness, { props: { level } });

			expect(title().tagName).toBe(`H${level}`);
			// The tag name alone is not the claim — the claim is that assistive
			// technology gets a heading at that level, which is what a consumer
			// migrating off a hand-rolled <h3> is trying to keep.
			expect(screen.getByRole('heading', { level, name: 'Estate summary' })).toBeInTheDocument();
		});
	}
});

describe('CardTitle heading and div parity', () => {
	it('emits an identical class list either way, with and without a caller class', () => {
		for (const className of [undefined, 'text-lg tracking-tight']) {
			render(CardTitleHarness, { props: { class: className } });
			const asDiv = title().className;
			cleanup();

			for (const level of LEVELS) {
				render(CardTitleHarness, { props: { level, class: className } });
				expect(title().className).toBe(asDiv);
				cleanup();
			}
		}
	});

	it('keeps the slot marker and the caller rest props on both branches', () => {
		render(CardTitleHarness);
		const asDiv = title();
		expect(asDiv).toHaveAttribute('data-slot', 'card-title');
		expect(asDiv).toHaveAttribute('id', 'probe-title');
		expect(asDiv).toHaveAttribute('data-testid', 'card-title');
		cleanup();

		render(CardTitleHarness, { props: { level: 3 } });
		const asHeading = title();
		expect(asHeading).toHaveAttribute('data-slot', 'card-title');
		expect(asHeading).toHaveAttribute('id', 'probe-title');
		expect(asHeading).toHaveAttribute('data-testid', 'card-title');
	});

	it('neutralises the UA heading metrics a div never carries', () => {
		// Compiled from the documented consumer chain, so this is the CSS a
		// consuming app actually serves, not what this package means in isolation.
		const css = compile(['text-base', 'leading-snug', 'font-medium']);

		// Size and weight: the class list overrides the UA values outright, and
		// preflight already levels them to `inherit` besides.
		expect(css).toMatch(/h1[^{]*,\s*h2[^{]*,\s*h3[^{]*,\s*h4[^{]*,\s*h5[^{]*,\s*h6[^{]*\{[^}]*font-size:\s*inherit/);
		expect(css).toMatch(/h1[^{]*,\s*h2[^{]*,\s*h3[^{]*,\s*h4[^{]*,\s*h5[^{]*,\s*h6[^{]*\{[^}]*font-weight:\s*inherit/);

		// Margin is the one UA heading property NOTHING in the class list touches
		// — `<h3>` gets `margin-block: 1em` from the UA sheet and a `<div>` gets
		// none, so a level-3 title would push the card header apart. Only
		// preflight's universal reset stops that, and this package does not own
		// preflight: an app that dropped it would get a layout shift from a prop
		// that promises none. Pinned so the dependency is visible rather than
		// assumed.
		expect(css).toMatch(/\*[^{]*\{[^}]*margin:\s*0/);

		// And the classes themselves resolve to something concrete, so the two
		// resets above are not the only thing standing between the branches.
		const properties = customProperties(css);
		expect(flatten(declaration(css, 'text-base', 'font-size') ?? '', properties)).toBe('1rem');
		expect(flatten(declaration(css, 'font-medium', 'font-weight') ?? '', properties)).toBe('500');
	});
});
