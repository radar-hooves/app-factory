/** The router's `page`, reactive as SvelteKit's is (self-test only): a navigation
 *  that clears `state` re-runs whatever read it. */
export const nav = $state({
	params: { persona: 'outrider' } as Record<string, string>,
	// Replaced wholesale by a test, never mutated in place, so SvelteURL's reactivity buys nothing.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	url: new URL('http://localhost/chat/outrider'),
	state: {} as { ask?: string }
});
