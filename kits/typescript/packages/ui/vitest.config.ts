import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['src/test/setup.ts'],
		include: ['src/**/*.{test,spec}.{js,ts}'],
		// Many tests compile real Tailwind, seconds each on the shared atlas
		// runner; vitest's 5s default failed 3 of 7 CI runs (measured 30/09/2026).
		testTimeout: 30_000
	},
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: resolve(import.meta.dirname, 'src/lib'),
			// This package is a LIBRARY: there is no app around it and so no
			// `svelte-kit sync` output to resolve `$app/*` against. They are here
			// only because `sveltekit-superforms`' entry point re-exports
			// SuperDebug.svelte, which imports both. Nothing this package ships
			// touches them. See src/test/stubs/app-environment.ts.
			'$app/environment': resolve(import.meta.dirname, 'src/test/stubs/app-environment.ts'),
			'$app/stores': resolve(import.meta.dirname, 'src/test/stubs/app-stores.ts'),
			'$app/navigation': resolve(import.meta.dirname, 'src/test/stubs/app-navigation.ts'),
			'$app/forms': resolve(import.meta.dirname, 'src/test/stubs/app-forms.ts')
		}
	}
});
