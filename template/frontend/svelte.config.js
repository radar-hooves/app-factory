import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// An element in src/elements/ names its tag for its own build
		// (vite.elements.config.ts), which compiles it as a custom element; the SPA
		// never imports one, so the warning svelte-check raises there is noise.
		warningFilter: (warning) => warning.code !== 'options_missing_custom_element'
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$api: 'src/lib/api'
		},
		version: {
			// Every deploy bakes the whole build into the image, so all chunk hashes
			// change at once and a tab open across a deploy holds dead module URLs.
			// Polling lets an idle tab notice the new version and reload while its
			// session is still valid, instead of discovering it by failing to import
			// a chunk later — at which point recovery depends on a version check that
			// an expired session turns into a 302 (see src/hooks.client.ts).
			pollInterval: 60_000
		}
	}
};

export default config;
