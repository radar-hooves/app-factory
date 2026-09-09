import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['src/test/setup.ts'],
		// A component whose OWN behaviour needs no consuming app to exercise
		// (a conditional render, a derived value) is pinned here; a claim about
		// real layout, CSS or the network stays a consumer's harness.
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
