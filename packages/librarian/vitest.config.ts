import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],
	test: {
		globals: true,
		environment: 'jsdom',
		// No test files ship with the initial move (none existed on the source
		// components); a consumer's own suite is where behaviour gets pinned.
		passWithNoTests: true,
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: resolve(import.meta.dirname, 'src/lib')
		}
	}
});
