import type { Component } from 'svelte';

/**
 * What `src/lib/art.ts` may export: this app's illustration for the states the
 * factory draws. Each is optional, and the factory's copy exports none.
 */
export interface StateArt {
	/** Above the words of the protected error page; `message` is what it says. */
	ErrorArt?: Component<{ status: number; message: string }>;
	/** In place of the protected layout's spinner while the caller loads. */
	LoadingArt?: Component;
}
