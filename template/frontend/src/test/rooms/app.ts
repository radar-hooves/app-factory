/**
 * A test app's `$lib/agent/app` (self-test only): the room page's extension
 * points as an app uses them. `room-page.svelte.test.ts` drives the page with
 * it; a stamp whose own `app.ts` re-exports it is what
 * `docs/design/rooms-screenshots/extended-*` photographs.
 */

import type { Briefing, Room } from '$lib/agent/rooms';

export { default as Turn } from './Turn.svelte';
export { default as Home } from './Home.svelte';

export function briefing(room: Room): Briefing {
	return {
		question: `Write a briefing on ${room.title}, every claim cited.`,
		title: `Briefing: ${room.title}`,
		summary: 'Everything held, under headings'
	};
}
