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
			// Only the members a test actually needs; add another `$app/*` stub
			// alongside this one in src/test/mocks/ the first time a test needs it.
			'$app/state': resolve(import.meta.dirname, 'src/test/mocks/app-state.ts')
		}
	}
});
