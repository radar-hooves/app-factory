import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// No `hot` option: vite-plugin-svelte 7 removed it, and it was always a no-op
	// here — vitest runs no dev server, so there is nothing to hot-reload.
	plugins: [svelte(), tailwindcss()],
	test: {
		globals: true,
		environment: 'jsdom',
		// An app that deletes the scaffold's example spec before writing its own
		// must not fail CI for having no tests yet.
		passWithNoTests: true,
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
			$lib: resolve(import.meta.dirname, 'src/lib'),
			$components: resolve(import.meta.dirname, 'src/lib/components'),
			$stores: resolve(import.meta.dirname, 'src/lib/stores'),
			$api: resolve(import.meta.dirname, 'src/lib/api'),
			// Every `$app/*` module SvelteKit provides virtually, stubbed here so
			// this file is the same in every app. It previously shipped one and told
			// each app to add the rest as its tests needed them, which made the
			// factory the author of its own drift — three apps ended up with three
			// different alias blocks and an exception each.
			'$app/state': resolve(import.meta.dirname, 'src/test/mocks/app-state.ts'),
			'$app/stores': resolve(import.meta.dirname, 'src/test/mocks/app-stores.ts'),
			'$app/navigation': resolve(import.meta.dirname, 'src/test/mocks/app-navigation.ts'),
			'$app/environment': resolve(import.meta.dirname, 'src/test/mocks/app-environment.ts'),
			'$app/forms': resolve(import.meta.dirname, 'src/test/mocks/app-forms.ts'),
			'$app/paths': resolve(import.meta.dirname, 'src/test/mocks/app-paths.ts')
		}
	}
});
