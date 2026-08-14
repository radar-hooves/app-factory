/**
 * Test-only stand-in for SvelteKit's `$app/stores`.
 *
 * Same reason as `app-state.ts`. `$app/stores` is the legacy store-based API
 * that `$app/state` supersedes; it is stubbed here because component code
 * migrated from it still imports it, not because new code should.
 *
 * `page` is WRITABLE rather than readable so a test can drive it. That makes it
 * shared mutable state across a file's tests, so `resetPage()` exists and
 * `src/test/setup.ts` calls it in a global `afterEach` — otherwise one test's
 * form result or status bleeds into the next, and isolation ends up resting on
 * a library's internal dedup rather than on the harness.
 */
import { readable, writable } from 'svelte/store';

const initialPage = () => ({
	url: new URL('http://localhost/'),
	params: {} as Record<string, string>,
	route: { id: null as string | null },
	status: 200,
	error: null as App.Error | null,
	data: {} as Record<string, unknown>,
	form: undefined as unknown
});

export const page = writable(initialPage());

export const resetPage = () => page.set(initialPage());

export const navigating = readable(null);
export const updated = readable(false);
