import type { ParamMatcher } from '@sveltejs/kit';

// What the backend and the proxy serve beside the SPA, never a client-side
// route: the API and /mcp (backend main.py's _API_PREFIXES), SvelteKit's build
// output (_IMMUTABLE_ASSET_PREFIX), the API documents (_DOCUMENT_ROUTES), and the
// browser-telemetry and identity-provider paths the proxy routes. Kept in step
// with main.py by hand.
const NOT_THE_SPA = [
	'api',
	'mcp',
	'_app',
	'openapi.json',
	'docs',
	'redoc',
	'faro',
	'outpost.goauthentik.io'
];

/**
 * A path the SPA owns, for (protected)/[...missing=spa]: anything but what the
 * backend or the proxy serves, and anything named like a file. A link to one of
 * those (a download under /api, a static file) must leave for a full page
 * load, which SvelteKit makes for a path no route matches; without this, the
 * catch-all would claim it and render "Page not found".
 */
export const match: ParamMatcher = (param) => {
	const segments = param.split('/');
	return !NOT_THE_SPA.includes(segments[0] ?? '') && !/\.\w+$/.test(segments.at(-1) ?? '');
};
