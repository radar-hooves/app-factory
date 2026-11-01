/**
 * Test-only stand-in for SvelteKit's `$app/state`.
 *
 * `$app/state` is a virtual module the real `sveltekit()` Vite plugin
 * provides; vitest.config.ts runs the bare `svelte()` plugin instead, so the
 * specifier has nothing to resolve to on its own. This file gives Vite a
 * real path to resolve, which is what lets a test `vi.mock('$app/state', ...)`
 * override it.
 *
 * `page` is REACTIVE (`$state`, hence the `.svelte.ts` name), as the real one
 * is: sveltekit-superforms 3 reads `page.form`, `page.status` and `page.data`
 * inside effects and re-validates when they change, so a plain object never
 * re-runs it. `applyAction` in `app-forms.ts` writes the action result here.
 * Shared mutable state across a file's tests, so `src/test/setup.ts` calls
 * `resetPage()` in a global `afterEach`.
 */
const initialPage = () => ({
	url: new URL('http://localhost/'),
	params: {} as Record<string, string>,
	route: { id: null as string | null },
	status: 200,
	error: null as App.Error | null,
	data: {} as Record<string, unknown>,
	form: undefined as unknown,
	state: {} as Record<string, unknown>
});

export const page = $state(initialPage());

export const resetPage = () => Object.assign(page, initialPage());

export const navigating = $state({
	from: null as { url: URL } | null,
	to: null as { url: URL } | null,
	type: null as string | null,
	willUnload: null as boolean | null,
	delta: null as number | null,
	complete: null as Promise<void> | null
});

export const updated = $state({ current: false, check: () => Promise.resolve(false) });
