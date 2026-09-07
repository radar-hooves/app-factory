/**
 * This app's own API modules, re-exported by the factory's barrel.
 *
 * THE extension point for `src/lib/api/index.ts`, which is owed byte-identical:
 * the barrel re-exports everything here after its own exports, so a call site
 * imports the factory's client and this app's domain functions from the same
 * `$lib/api`. Measured 06/09/2026 across the fleet: three apps had rewritten the
 * barrel to add seven, thirty and two hundred lines of their own — the same file
 * diverging three ways for the same reason, which is what a seam is for.
 *
 * Put the app's typed wrappers in modules beside this file (`registry.ts`,
 * `retrieval.ts`, …) and re-export them here. Empty is the correct state until
 * the app has a domain of its own.
 */
export {};
