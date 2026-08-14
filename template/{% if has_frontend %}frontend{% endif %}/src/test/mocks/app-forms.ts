/**
 * Test-only stand-in for SvelteKit's `$app/forms`.
 *
 * Same reason as `app-state.ts`. `applyAction` writes the action result back
 * into the `page` store from `app-stores.ts`, so a component under test sees
 * `form` and `status` update the way it would in the browser; `enhance` is a
 * no-op returning the teardown shape SvelteKit's own does, so a form using
 * `use:enhance` mounts without a router.
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

export function enhance(_form: HTMLFormElement, _submit?: unknown): { destroy: () => void } {
	return { destroy: () => {} };
}
