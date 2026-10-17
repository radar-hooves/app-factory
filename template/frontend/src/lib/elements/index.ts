/**
 * What every element this app serves is built on (`vite.elements.config.ts`).
 * An element is a component in `src/elements/` that names its tag and this
 * module's `element` in its options:
 *
 *     <svelte:options customElement={{ tag: 'library-catalogue', extend: element }} />
 *
 * It renders the kit inside its shadow root, in the palette of whichever page
 * placed it, and reads this app's API as the viewer through `request`.
 *
 * Self-contained: it runs on another app's origin, so nothing in the console's
 * own graph (`$lib/api`, the session) can reach it.
 */
import css from './elements.css?inline';

/** The app that served this bundle, wherever the element is placed. */
export const origin = new URL(import.meta.url).origin;

/** Reached top-level, it signs the viewer in to this app and returns them (`elements.py`). */
export const SIGN_IN_PATH = '/elements/session';

let kit: CSSStyleSheet | undefined;
const placed = new Set<HTMLElement>();
const page = document.documentElement;

// Tailwind's `dark:` reads `.dark` on the page, which a shadow root cannot see.
const shade = (host: HTMLElement) =>
	host.toggleAttribute('data-dark', page.classList.contains('dark'));
new MutationObserver(() => placed.forEach(shade)).observe(page, { attributeFilter: ['class'] });

function adopt(root: ShadowRoot): void {
	if (!kit) {
		kit = new CSSStyleSheet();
		kit.replaceSync(css);
		// A shadow root ignores @property, and Tailwind's borders, rings and
		// shadows read the initial values it registers, so the page holds them.
		const registered = new CSSStyleSheet();
		for (const rule of kit.cssRules) {
			if (rule instanceof CSSPropertyRule) registered.insertRule(rule.cssText);
		}
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, registered];
	}
	root.adoptedStyleSheets = [...root.adoptedStyleSheets, kit];
}

type Element = new () => HTMLElement & {
	connectedCallback?(): unknown;
	disconnectedCallback?(): unknown;
};

/** The `extend` every element names: the kit's stylesheet, and the page's mode. */
export function element(Base: Element): Element {
	return class extends Base {
		constructor() {
			super();
			if (this.shadowRoot) adopt(this.shadowRoot);
		}
		override connectedCallback() {
			placed.add(this);
			shade(this);
			return super.connectedCallback?.();
		}
		override disconnectedCallback() {
			placed.delete(this);
			return super.disconnectedCallback?.();
		}
	};
}

export type Result<T> =
	| { ok: true; data: T }
	| { ok: false; kind: 'signing-in' | 'signed-out' | 'refused' | 'not-found' }
	| { ok: false; kind: 'error'; status: number };

const SIGNING_IN = { ok: false, kind: 'signing-in' } as const;

/** When this tab last made the hop. Signed out again within the window means it did not take. */
const HOPPED_AT = `elements:${origin}:signed-in-at`;
const HOP_WINDOW_MS = 60_000;

/** Set once a hop has begun, so every element on the page waits for it rather than starting another. */
let hopping = false;

/**
 * GET one of this app's routes as the viewer. Signed out (a 401, a throw from
 * forward-auth's uncredentialed redirect, a 200 that is not JSON) is what a
 * browser that has never visited this app gives, so the page makes the
 * sign-in hop once and comes back to retry. Signed out again within a minute
 * of a hop is final, so it never loops. A hidden frame cannot do this:
 * Authentik's sign-in pages refuse every frame.
 */
export async function request<T>(path: string): Promise<Result<T>> {
	if (hopping) return SIGNING_IN;
	const result = await attempt<T>(path);
	if (result.ok || result.kind !== 'signed-out') return result;
	if (hopping) return SIGNING_IN;
	try {
		if (Date.now() - Number(sessionStorage.getItem(HOPPED_AT) ?? 0) < HOP_WINDOW_MS) return result;
		sessionStorage.setItem(HOPPED_AT, String(Date.now()));
	} catch {
		return result;
	}
	hopping = true;
	location.assign(signInUrl());
	return SIGNING_IN;
}

/** The hop by hand, for an element's own "sign in" link once `request` has given up. */
export function signInUrl(): string {
	return `${origin}${SIGN_IN_PATH}?return=${encodeURIComponent(location.href)}`;
}

async function attempt<T>(path: string): Promise<Result<T>> {
	let response: Response;
	try {
		response = await fetch(`${origin}${path}`, {
			credentials: 'include',
			headers: { Accept: 'application/json' }
		});
	} catch {
		return { ok: false, kind: 'signed-out' };
	}
	if (response.status === 401) return { ok: false, kind: 'signed-out' };
	// A refusal (the sign-in's own policy, or this app's), never a missing session.
	if (response.status === 403) return { ok: false, kind: 'refused' };
	if (response.status === 404) return { ok: false, kind: 'not-found' };
	if (!response.ok) return { ok: false, kind: 'error', status: response.status };
	if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
		return { ok: false, kind: 'signed-out' };
	}
	return { ok: true, data: (await response.json()) as T };
}
