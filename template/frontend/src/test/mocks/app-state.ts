/**
 * Test-only stand-in for SvelteKit's `$app/state`.
 *
 * `$app/state` is a virtual module the real `sveltekit()` Vite plugin
 * provides; vitest.config.ts runs the bare `svelte()` plugin instead, so the
 * specifier has nothing to resolve to on its own. This file gives Vite a
 * real path to resolve, which is what lets a test `vi.mock('$app/state', ...)`
 * override it — that mock replaces this file's exports entirely, so its own
 * content only matters as a fallback shape for a test that imports
 * `$app/state` without mocking it.
 */
export const page = {
	params: {} as Record<string, string>,
	url: new URL('http://localhost/')
};
