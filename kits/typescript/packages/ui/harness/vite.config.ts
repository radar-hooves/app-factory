import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// A standalone Vite app, not part of the published package: it exists only so a
// real browser can be driven over the built shell. Kept out of `files` in
// package.json and out of svelte-package's src/lib input by living here.
export default defineConfig({
	root: resolve(import.meta.dirname),
	plugins: [svelte()],
	resolve: { alias: { $lib: resolve(import.meta.dirname, '..', 'src', 'lib') } },
	build: { outDir: resolve(import.meta.dirname, 'dist'), emptyOutDir: true }
});
