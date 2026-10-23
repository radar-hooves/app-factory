/**
 * THIS app's illustration for the states the factory draws: the extension
 * point for `routes/(protected)/+error.svelte` and the protected layout's
 * loading state. App-owned: copier never overwrites it.
 *
 * Export any of `StateArt`'s members (`$lib/state-art`) by name: `ErrorArt`
 * (a component given the `status` and `message`, drawn above the page's words)
 * and `LoadingArt` (a component drawn in place of the spinner). The factory's
 * copy exports none.
 */
export {};
