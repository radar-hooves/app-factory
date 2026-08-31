/**
 * The promoted Formsnap wrapper set (design-system#16).
 *
 * Three apps had vendored a byte-for-byte copy of these nine files — the diff
 * between two of them was quote style, and between those and the third was
 * which package the shared `cn`/`Label` were imported from. The reason to own
 * them here is not tidiness: it is that a fix to the ARIA wiring, or to how an
 * error is announced, otherwise lands once per app.
 *
 * So these tests assert the WIRING rather than the markup. A test that only
 * checked classes would have passed against all three copies while any one of
 * them silently stopped pointing `aria-describedby` at its own error node.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import FormHarness from './form.svelte';

describe('Form wrappers', () => {
	it('renders the field, its label, its description and the submit button', () => {
		render(FormHarness);
		expect(screen.getByTestId('field')).toBeInTheDocument();
		expect(screen.getByText('Title')).toBeInTheDocument();
		expect(screen.getByText('What the record is called.')).toBeInTheDocument();
		expect(screen.getByTestId('submit')).toBeInTheDocument();
	});

	it('Form.Button is a submit button without the call site saying so', () => {
		// The whole reason it exists. A Button defaults to type="button", so a
		// form whose submit control forgot the type silently does nothing.
		render(FormHarness);
		expect(screen.getByTestId('submit')).toHaveAttribute('type', 'submit');
	});

	it('the label is FOR the control, resolved by Formsnap rather than by hand', () => {
		render(FormHarness);
		const input = screen.getByTestId('input');
		const label = screen.getByTestId('label');
		expect(input.id).toBeTruthy();
		expect(label).toHaveAttribute('for', input.id);
		// getByLabelText is the accessibility-tree question, not the markup one.
		expect(screen.getByLabelText('Title')).toBe(input);
	});

	it('the control points aria-describedby at its own description', () => {
		render(FormHarness);
		const input = screen.getByTestId('input');
		const description = screen.getByTestId('description');
		expect(description.id).toBeTruthy();
		expect(input.getAttribute('aria-describedby') ?? '').toContain(description.id);
	});

	it('an error is rendered, announced, and flips the control invalid', async () => {
		const { component } = render(FormHarness);
		(component as unknown as { raiseError: () => void }).raiseError();
		await tick();
		await tick();

		expect(screen.getByText('Title is required')).toBeInTheDocument();

		const input = screen.getByTestId('input');
		// Three separate claims, and an app that hand-rolls this usually gets one
		// or two of them: the field is marked invalid, the error node is in the
		// description chain so a screen reader reads it with the field, and the
		// label carries the error state the destructive styling hangs off.
		expect(input).toHaveAttribute('aria-invalid', 'true');
		const errorNode = screen.getByText('Title is required');
		const describedBy = input.getAttribute('aria-describedby') ?? '';
		const errorsContainer = screen.getByTestId('errors');
		expect(describedBy).toContain(errorsContainer.id || errorNode.id);
		expect(screen.getByTestId('label')).toHaveAttribute('data-fs-error');
	});

	it('the error text carries the destructive class the ladder defines', async () => {
		const { component } = render(FormHarness);
		(component as unknown as { raiseError: () => void }).raiseError();
		await tick();
		await tick();
		expect(screen.getByTestId('errors').className).toContain('text-destructive');
	});
});
