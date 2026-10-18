/**
 * A test app's `$lib/agent/app` (self-test only): the chat page's extension
 * points as an app uses them. `chat-page.svelte.test.ts` drives the page with
 * it; a stamp whose own `app.ts` re-exports it is what
 * `app-factory docs/design/chat-screenshots/extended-*` photographs.
 */

import type { Briefing, Persona } from '$lib/agent/chat';

export { default as Turn } from './Turn.svelte';
export { default as Home } from './Home.svelte';

export function briefing(persona: Persona): Briefing {
	return {
		question: `Write a briefing on ${persona.name}, every claim cited.`,
		title: `Briefing: ${persona.name}`,
		summary: 'Everything held, under headings'
	};
}
