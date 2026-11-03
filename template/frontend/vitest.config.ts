import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The element client's test asserts a sign-in hop, not a stylesheet. Importing
// `src/lib/elements/index.ts` pulls in `elements.css?inline`, which Tailwind compiles from the
// whole kit in 15-20s cold and past a minute on a loaded host (three tests timed
// out on the CI runner, 03/11/2026); the build and the proof compile it for real.
const noElementsStylesheet: Plugin = {
	name: 'no-elements-stylesheet',
	enforce: 'pre',
	load: (id) =>
		id.split('?')[0]?.endsWith('/src/lib/elements/elements.css') ? '/* none */' : undefined
};

export default defineConfig({
	// No `hot` option: vite-plugin-svelte 7 removed it, and it was always a no-op
	// here — vitest runs no dev server, so there is nothing to hot-reload.
	plugins: [noElementsStylesheet, svelte(), tailwindcss()],
	test: {
		globals: true,
		environment: 'jsdom',
		// An app that deletes the scaffold's example spec before writing its own
		// must not fail CI for having no tests yet.
		passWithNoTests: true,
		// A form test that types and submits takes 1-2.5s alone, and CI runs it on
		// the host that also runs the backend suite across eight workers and the
		// apps themselves. At the 5s default that contention failed five of them
		// on a fleet app's first parallel run (27/09/2026); a real hang still fails.
		testTimeout: 20_000,
		setupFiles: ['src/test/setup.ts'],
		include: ['src/**/*.{test,spec}.{js,ts}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/.svelte-kit/']
		}
	},
	resolve: {
		// Ensure Svelte resolves client-side (not server) modules in jsdom.
		conditions: ['browser'],
		alias: {
			// Every `$app/*` module SvelteKit provides virtually, stubbed here so
			// this file is the same in every app. It previously shipped one and told
			// each app to add the rest as its tests needed them, which made the
			// factory the author of its own drift — three apps ended up with three
			// different alias blocks and an exception each.
			'$app/state': resolve(import.meta.dirname, 'src/test/mocks/app-state.svelte.ts'),
			'$app/navigation': resolve(import.meta.dirname, 'src/test/mocks/app-navigation.ts'),
			'$app/env': resolve(import.meta.dirname, 'src/test/mocks/app-env.ts'),
			'$app/forms': resolve(import.meta.dirname, 'src/test/mocks/app-forms.ts'),
			'$app/paths': resolve(import.meta.dirname, 'src/test/mocks/app-paths.ts')
		}
	}
});
