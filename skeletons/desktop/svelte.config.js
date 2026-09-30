import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// A desktop app has no server: the webview loads a static SPA from the bundle,
// so every route falls back to index.html.
/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: 'index.html' }),
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$api: 'src/lib/api'
		}
	},
	onwarn: (warning, handler) => {
		// A context menu is mouse-only by nature; its keyboard path is the menu key.
		if (warning.code === 'a11y_click_events_have_key_events') return;
		handler(warning);
	}
};

export default config;
