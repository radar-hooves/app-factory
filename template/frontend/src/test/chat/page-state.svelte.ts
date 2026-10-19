/** The router's `page`, reactive as SvelteKit's is (self-test only): a navigation
 *  that clears `state` re-runs whatever read it. */
export const nav = $state({
	params: { persona: 'outrider' } as Record<string, string>,
	url: new URL('http://localhost/chat/outrider'),
	state: {} as { ask?: string }
});
