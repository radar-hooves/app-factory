/**
 * Test-only stand-in for SvelteKit's `$app/paths`.
 *
 * Same reason as `app-state.svelte.ts`. The app is served from the domain root,
 * so `resolve` only fills a route id's parameters and drops its groups — the
 * suite exercises what a component does with a route, never SvelteKit's own
 * base-path resolution. Code wrapping a `goto()` target in `resolve()` (as
 * `svelte/no-navigation-without-resolve` requires) therefore still runs under
 * test.
 */
export const resolve = (route: string, params: Record<string, string> = {}): string =>
	route
		.replace(/\/\([^)/]*\)/g, '')
		.replace(/\[(?:\.\.\.)?([^\]=]+)(?:=[^\]]+)?\]/g, (_, name: string) => params[name] ?? '');
