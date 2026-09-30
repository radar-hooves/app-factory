/**
 * Regression guard for the `checkbox` primitive's barrel export, ported from the
 * reference frontend this component was extracted from — that copy is deleted
 * there as the app migrates onto this package, and the coverage belongs where
 * the component now lives.
 *
 * The defect, fixed on extraction in 2026.7.0: `checkbox/index.ts` re-exported
 * bits-ui's `Checkbox` compound namespace under the name `Checkbox`, shadowing
 * the styled shadcn wrapper, which was reachable only as the default export:
 *
 *   import { Checkbox as CheckboxPrimitive } from 'bits-ui';
 *   export { CheckboxPrimitive as Checkbox };
 *   export { default } from './checkbox.svelte';
 *
 * Every consumer writing `import { Checkbox } from '@poodle64/ui/checkbox'` got
 * a plain object rather than a mountable component. It compiled and typechecked
 * cleanly; only mounting the named export surfaces it.
 *
 * Hence two assertions, neither redundant:
 *   1. the mounted element carries `data-slot="checkbox"` — the wrapper's own
 *      marker, which the raw namespace object cannot produce;
 *   2. the control genuinely toggles, off → on → off, driven rather than
 *      rendered (rules-library/core/73-verification.md §"Behaviour vs
 *      Appearance"). A mount-only check passes on a checkbox that never moves.
 *
 * Both assertions were driven red before being kept, against the two shapes the
 * defect can take. Restoring the historical barrel verbatim fails both tests at
 * `render()` with "Checkbox is not a function" — Svelte will not mount a plain
 * object, so no assertion is reached. Exporting `CheckboxPrimitive.Root`
 * instead — mountable, correct role, toggles fine, simply not this package's
 * component — fails only the `data-slot` assertion while the toggle stays
 * green. That second shape is why the marker check is not redundant with
 * driving the control: an unstyled bits-ui root passes every behavioural
 * assertion and ships a checkbox with none of the styling this package exists
 * to provide.
 *
 * `interaction-smoke.test.ts` also drives a Checkbox, as one representative of
 * the bindable-toggle shape. This file is the named guard for that specific
 * export defect: it asserts the wrapper marker and the return leg that the
 * smoke pass does not, and it fails naming the component rather than as a
 * collateral casualty of a broad suite.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CheckboxHarness from './checkbox.svelte';

describe('checkbox barrel export', () => {
	it('mounts the styled wrapper, not the bits-ui namespace object', () => {
		render(CheckboxHarness);

		const checkbox = screen.getByRole('checkbox', { name: 'regression-checkbox' });
		expect(checkbox).toHaveAttribute('data-slot', 'checkbox');
	});

	it('toggles on and back off when clicked', async () => {
		render(CheckboxHarness);
		const checkbox = screen.getByRole('checkbox', { name: 'regression-checkbox' });
		const bound = screen.getByTestId('checkbox-bound-state');

		expect(checkbox).toHaveAttribute('aria-checked', 'false');
		expect(bound).toHaveTextContent('false');

		await fireEvent.click(checkbox);

		await waitFor(() => {
			expect(checkbox).toHaveAttribute('aria-checked', 'true');
		});
		expect(bound).toHaveTextContent('true');

		await fireEvent.click(checkbox);

		await waitFor(() => {
			expect(checkbox).toHaveAttribute('aria-checked', 'false');
		});
		expect(bound).toHaveTextContent('false');
	});
});
