import { error } from '@sveltejs/kit';

// A URL no route serves. Thrown here rather than left to the router, whose own
// 404 renders at the root, outside the frame and the guard: this one reaches
// (protected)/+error.svelte. Any more specific route, a public one outside
// (protected)/ included, wins over this catch-all, and the `spa` matcher
// (src/params/spa.ts) leaves what the backend serves to a full page load.
export function load() {
	error(404, 'Not found');
}
