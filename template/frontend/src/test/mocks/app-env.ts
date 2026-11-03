/**
 * Test-only stand-in for SvelteKit's `$app/env`.
 *
 * Same reason as `app-state.svelte.ts`. The values describe the environment the suite
 * actually runs in: jsdom is a browser-like environment, tests are a dev build,
 * and nothing is prerendering.
 */
export const browser = true;
export const dev = true;
export const building = false;
export const version = 'test';
