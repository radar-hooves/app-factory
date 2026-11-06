/**
 * An element's API client: this app's API read as the viewer from whichever page
 * placed the element, and the page's one sign-in hop (`elements.py`). Re-exported
 * by `index.ts`, which elements import; apart from it so a test of the client
 * loads no component.
 */
import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from '#lib/api/schema.js';

/** The app that served this bundle, wherever the element is placed. */
export const origin = new URL(import.meta.url).origin;

/** Reached top-level, it signs the viewer in to this app and returns them (`elements.py`). */
export const SIGN_IN_PATH = '/elements/session';

/** When this tab last made the hop. Signed out again within the window means it did not take. */
const HOPPED_AT = `elements:${origin}:signed-in-at`;
const HOP_WINDOW_MS = 60_000;

/** Set once a hop has begun, so every element on the page waits for it rather than starting another. */
let hopping = false;

const signedOut = () => new Response(null, { status: 401 });

function hop(): void {
	if (hopping) return;
	try {
		if (Date.now() - Number(sessionStorage.getItem(HOPPED_AT) ?? 0) < HOP_WINDOW_MS) return;
		sessionStorage.setItem(HOPPED_AT, String(Date.now()));
	} catch {
		return;
	}
	hopping = true;
	location.assign(signInUrl());
}

/**
 * Signed out (a 401, a throw from forward-auth's redirect, which carries no
 * CORS headers, or a sign-in page answering in the API's place) is what a
 * browser that has never visited this app gives, so the page makes the
 * sign-in hop once and comes back to ask again. Signed out again within a
 * minute of a hop is final, so it never loops. Every signed-out answer reaches
 * the element as a 401. A request the element aborted throws, as it would anywhere.
 */
const signIn: Middleware = {
	onRequest: () => (hopping ? signedOut() : undefined),
	onError: ({ error }) =>
		typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
			? undefined
			: signedOut(),
	onResponse({ response }) {
		const page = response.ok && (response.headers.get('content-type') ?? '').includes('text/html');
		if (response.status !== 401 && !page) return undefined;
		hop();
		return signedOut();
	}
};

/** This app's API, as the viewer, from whichever page placed the element. */
export const api = createClient<paths>({
	baseUrl: origin,
	credentials: 'include',
	headers: { Accept: 'application/json' }
});
api.use(signIn);

/** Whether the page is on its way to sign in: a 401 then means "signing you in", not "signed out". */
export const signingIn = () => hopping;

/** The hop by hand, for an element's own "sign in" link once a 401 is final. */
export function signInUrl(): string {
	return `${origin}${SIGN_IN_PATH}?return=${encodeURIComponent(location.href)}`;
}
