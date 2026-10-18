// A page whose title is fetched data (a record's name) cannot return it from
// `load`: in SPA mode `load` does not call the API. It calls `usePageTitle`
// instead, and the root layout shows that once it resolves; the route's static
// `load` title stays the fallback until then, and again after the page is left.
let current = $state.raw<{ title: string } | null>(null);

export function dynamicPageTitle(): string | undefined {
	return current?.title;
}

/** Call during component init; `title` is read reactively, undefined while loading. */
export function usePageTitle(title: () => string | undefined): void {
	$effect(() => {
		const next = title();
		if (!next) return;
		const mine = { title: next };
		current = mine;
		return () => {
			if (current === mine) current = null;
		};
	});
}
