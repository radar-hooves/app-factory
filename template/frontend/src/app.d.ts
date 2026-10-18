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
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
