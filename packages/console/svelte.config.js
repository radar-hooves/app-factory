import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * adapter-static, matching the canonical template's own adapter choice. This
 * console has no backend and never will: the repo's product is two published
 * packages, and `canonical-app-shape.md` governs a library that also ships a
 * console on the console only.
 */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		alias: { $components: 'src/lib/components' }
	}
};

export default config;
