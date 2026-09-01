/**
 * Test-only stand-in for SvelteKit's `$app/forms`.
 *
 * Same reason as `app-state.ts`. `applyAction` writes the action result back
 * into the `page` store from `app-stores.ts`, so a component under test sees
 * `form` and `status` update the way it would in the browser.
 *
 * `enhance` must genuinely intercept the form's submit event, and a stub that
 * returns `{ destroy(){} }` without listening is the trap this file exists to
 * avoid. `sveltekit-ui-patterns.md` requires `sveltekit-superforms` with
 * `SPA: true` for every form, and superforms' own `use:enhance` WRAPS this one
 * — so an inert stub swallows every submission silently. It does not throw and
 * nothing fails loudly; the submit callback is simply never invoked and the
 * assertion waits for a call that cannot come. Measured in a stamped app:
 * swapping the interception out failed 17 form-submit assertions across 6 spec
 * files, and every one of them read as a component bug.
 *
 * In SPA mode superforms always cancels the native submission and validates
 * client-side, so there is no fetch fallback to reproduce here — the callback
 * receives the same input shape SvelteKit's own `enhance` passes, and that is
 * the whole contract.
 */
import type { ActionResult } from '@sveltejs/kit';

import { page } from './app-stores';

export function applyAction(result: ActionResult): Promise<void> {
	if (result.type === 'error' || result.type === 'redirect') return Promise.resolve();
	page.update((current) => ({ ...current, form: result.data ?? null, status: result.status }));
	return Promise.resolve();
}

export function deserialize(result: string): unknown {
	return JSON.parse(result);
}

/** The argument SvelteKit's own `enhance` hands its submit callback. */
export type SubmitInput = {
	action: URL;
	formData: FormData;
	formElement: HTMLFormElement;
	controller: AbortController;
	submitter: HTMLElement | null;
	cancel: () => void;
};

export function enhance(
	formElement: HTMLFormElement,
	submit?: (input: SubmitInput) => unknown
): { destroy: () => void } {
	const handler = (event: SubmitEvent) => {
		// jsdom does not implement form submission, but preventDefault also stops
		// the not-implemented error it logs, and mirrors what SvelteKit does.
		event.preventDefault();
		void submit?.({
			action: new URL(formElement.getAttribute('action') || '/', 'http://localhost/'),
			formData: new FormData(formElement),
			formElement,
			controller: new AbortController(),
			submitter: event.submitter ?? null,
			cancel: () => {}
		});
	};
	formElement.addEventListener('submit', handler);
	return {
		destroy: () => formElement.removeEventListener('submit', handler)
	};
}
