// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { ShellMeasure } from '@poodle64/ui/app-shell';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		/** What a route's load says about its page, read by the root layout and the frame. */
		interface PageData {
			/** The tab title's page part. */
			title?: string;
			/** How wide the page body may get (AppShell `measure`). */
			measure?: ShellMeasure;
			/** False for a route that pads its own panes. */
			padded?: boolean;
		}
		/** Navigation state a page hands the next one; a pasted link cannot carry it. */
		interface PageState {
			/** A question the chat page asks on arrival, `goto('/chat/<persona>', { state: { ask } })`. */
			ask?: string;
			/** Files that go with `ask`; `handOff` from `$lib/agent/chat` sets both. */
			files?: File[];
			/** The kind `ask` is asked as (`BRIEFING`); absent, a plain question. */
			kind?: string;
		}
		// interface Platform {}
	}
}

export {};
