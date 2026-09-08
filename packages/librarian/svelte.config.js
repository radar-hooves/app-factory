import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Library package (@sveltejs/package), not a deployable app: no `kit.adapter`.
// @sveltejs/kit is a build-tooling dependency only (svelte-kit sync, svelte-check).
/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess()
};

export default config;
