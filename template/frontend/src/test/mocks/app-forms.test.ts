import { describe, expect, it, vi } from 'vitest';

import { enhance } from './app-forms';

/**
 * The mock's own coverage. `enhance` is the one mock in this directory with
 * behaviour rather than a shape, and the behaviour is invisible when it is
 * wrong: an inert stub swallows every submission without throwing, so the only
 * symptom is a form-submit assertion timing out somewhere else entirely.
 */
function mountForm(action?: string): HTMLFormElement {
	const form = document.createElement('form');
	if (action) form.setAttribute('action', action);
	const field = document.createElement('input');
	field.name = 'title';
	field.value = 'a value';
	form.append(field);
	document.body.append(form);
	return form;
}

describe('the $app/forms enhance mock', () => {
	it('invokes the submit callback when the form is submitted', () => {
		const form = mountForm();
		const submit = vi.fn();

		enhance(form, submit);
		form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }));

		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('cancels the native submission, so a test never navigates', () => {
		const form = mountForm();
		enhance(form, vi.fn());

		const event = new SubmitEvent('submit', { cancelable: true, bubbles: true });
		form.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it("hands the callback the input shape SvelteKit's own enhance passes", () => {
		const form = mountForm('/items');
		const submit = vi.fn();

		enhance(form, submit);
		form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }));

		const input = submit.mock.calls[0]?.[0];
		expect(input.action).toBeInstanceOf(URL);
		expect(input.action.pathname).toBe('/items');
		expect(input.formData.get('title')).toBe('a value');
		expect(input.formElement).toBe(form);
		expect(input.controller).toBeInstanceOf(AbortController);
		expect(typeof input.cancel).toBe('function');
	});

	it('tolerates a form used with no callback at all', () => {
		const form = mountForm();
		enhance(form);
		expect(() =>
			form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }))
		).not.toThrow();
	});

	it('stops listening once destroyed, so an unmounted form cannot fire', () => {
		const form = mountForm();
		const submit = vi.fn();

		enhance(form, submit).destroy();
		form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }));

		expect(submit).not.toHaveBeenCalled();
	});
});
