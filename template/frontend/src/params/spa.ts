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

// This app's own backend prefixes, the keys of frontend/app-proxy.ts, which
// vite.config.ts reads at build time: an app serving /v1 or /client beside
// /api declares it there once, for the dev proxy and for this matcher alike.
// Undefined where no Vite config ran (the unit tests).
declare const __APP_BACKEND_PREFIXES__: readonly string[] | undefined;

/** A proxy key's first path segment: '^/v1/', '/v1/' and '/v1' all name 'v1'. */
function firstSegment(key: string): string {
	return key.replace(/^\^?\/*/, '').split('/')[0] ?? '';
}

/**
 * A path the SPA owns, for (protected)/[...missing=spa]: anything but what the
 * backend or the proxy serves, and anything named like a file. A link to one of
 * those (a download under /api, a static file) must leave for a full page
 * load, which SvelteKit makes for a path no route matches; without this, the
 * catch-all would claim it and render "Page not found".
 */
export function spaMatcher(appPrefixes: readonly string[]): ParamMatcher {
	const notTheSpa = new Set([...NOT_THE_SPA, ...appPrefixes.map(firstSegment)]);
	return (param) => {
		const segments = param.split('/');
		return !notTheSpa.has(segments[0] ?? '') && !/\.\w+$/.test(segments.at(-1) ?? '');
	};
}

export const match = spaMatcher(
	typeof __APP_BACKEND_PREFIXES__ === 'undefined' ? [] : __APP_BACKEND_PREFIXES__
);
