import { describe, expect, it } from 'vitest';

import { applyAction } from './app-forms';
import { page, resetPage } from './app-state.svelte';

/**
 * sveltekit-superforms 3 re-validates from an effect that reads `page.form`
 * and `page.status`; a plain object never re-runs it, which is the fault this
 * mock's reactivity closes.
 */
describe('the $app/state page mock', () => {
	it('re-runs an effect when applyAction writes the result', async () => {
		const seen: unknown[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push([page.form, page.status]);
			});
		});
		await Promise.resolve();
		await applyAction({ type: 'failure', status: 400, data: { error: 'x' }, location: '/' });
		await Promise.resolve();
		stop();
		expect(seen.at(-1)).toEqual([{ error: 'x' }, 400]);
		expect(seen.length).toBeGreaterThan(1);
	});

	it('resets to its initial shape', () => {
		page.status = 500;
		resetPage();
		expect(page.status).toBe(200);
	});
});
