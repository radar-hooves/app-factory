/**
 * This app's own API modules, re-exported by the factory's barrel.
 *
 * THE extension point for `src/lib/api/index.ts`, which is owed byte-identical:
 * the barrel re-exports everything here after its own exports, so a call site
 * imports the factory's client and this app's domain functions from the same
 * `#lib/api/index.js`. Measured 06/09/2026 across the fleet: three apps had rewritten the
 * barrel to add seven, thirty and two hundred lines of their own — the same file
 * diverging three ways for the same reason, which is what a seam is for.
 *
 * Put the app's typed wrappers in modules beside this file (`registry.ts`,
 * `retrieval.ts`, …) and re-export them here. Empty is the correct state until
 * the app has a domain of its own.
 */

/**
 * The calls that are legitimately slower than the client's default budget, by
 * SCHEMA path (the templated path openapi-fetch hands the middleware, e.g.
 * '/api/items/{id}'), in milliseconds. `client.ts` reads it for every request.
 *
 * Empty in the factory and expected to stay near-empty: an entry is an argued
 * exception, not a tuning knob, and it names the one call that fans out or waits
 * on something outside this app. Raising the default instead would hide every
 * stuck call behind the slowest one's budget, which is the opposite of what a
 * timeout is for. One app arrived here the hard way — a retrieval query fanning
 * out across collections was abandoned at 30s while the API went on to answer it
 * fine. Keep this a plain literal with no imports: the client imports it.
 */
export const SLOW_PATHS: Record<string, number> = {};
