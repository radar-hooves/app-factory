/**
 * Test-only stand-in for SvelteKit's `$app/paths`.
 *
 * Same reason as `app-state.svelte.ts`. The app is served from the domain root, so `resolve` is an identity function — the
 * suite exercises what a component does with a route, never SvelteKit's own
 * base-path resolution. Code wrapping a `goto()` target in `resolve()` (as
 * `svelte/no-navigation-without-resolve` requires) therefore still runs under
 * test.
 */
export const resolve = (path: string): string => path;
