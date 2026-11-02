/**
 * Test-only stand-in for SvelteKit's `$app/state`.
 *
 * `$app/state` is a virtual module the real `sveltekit()` Vite plugin
 * provides; vitest.config.ts runs the bare `svelte()` plugin instead, so the
 * specifier has nothing to resolve to on its own. This file gives Vite a
 * real path to resolve, which is what lets a test `vi.mock('$app/state', ...)`
 * override it.
 *
 * `page` is REACTIVE (`$state.raw` per field, hence the `.svelte.ts` name),
 * as the real one is (SvelteKit `state.svelte.js`): a field is replaced whole
 * and what a test stores comes back as itself, never a deep Proxy, which
 * formsnap's `structuredClone` of a form's errors cannot clone. sveltekit-superforms 3 reads `page.form`, `page.status` and `page.data`
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

type PageShape = ReturnType<typeof initialPage>;

// One `$state.raw` per field, as SvelteKit holds them; the OWN enumerable
// accessors are what `$app/state` exposes, so `{ ...page }` (superforms 3 does
// that) reads the values rather than an empty object.
const fields = new (class {
	url = $state.raw(initialPage().url);
	params = $state.raw(initialPage().params);
	route = $state.raw(initialPage().route);
	status = $state.raw(initialPage().status);
	error = $state.raw(initialPage().error);
	data = $state.raw(initialPage().data);
	form = $state.raw(initialPage().form);
	state = $state.raw(initialPage().state);
})();

export const page = Object.defineProperties(
	{} as PageShape,
	Object.fromEntries(
		(Object.keys(initialPage()) as (keyof PageShape)[]).map((key) => [
			key,
			{
				enumerable: true,
				get: () => fields[key],
				set: (value: never) => {
					fields[key] = value;
				}
			}
		])
	)
);

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
