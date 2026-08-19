/**
 * Test-only stand-in for SvelteKit's `$app/navigation`.
 *
 * Same reason as `app-state.ts`: these are virtual modules the real
 * `sveltekit()` Vite plugin provides, and vitest.config.ts runs the bare
 * `svelte()` plugin instead, so the specifier has nothing to resolve to on its
 * own. Giving Vite a real path to resolve is what lets a test
 * `vi.mock('$app/navigation', ...)` override it.
 *
 * Every export is a `vi.fn()`, so a test can assert navigation was requested
 * without a router being present. A test that needs a return value mocks it.
 */
import { vi } from 'vitest';

export const goto = vi.fn();
export const invalidate = vi.fn();
export const invalidateAll = vi.fn();
export const preloadData = vi.fn();
export const preloadCode = vi.fn();
export const beforeNavigate = vi.fn();
export const afterNavigate = vi.fn();
export const onNavigate = vi.fn();
export const pushState = vi.fn();
export const replaceState = vi.fn();
export const disableScrollHandling = vi.fn();
