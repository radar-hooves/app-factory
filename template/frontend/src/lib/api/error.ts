/**
 * API error extraction utility.
 *
 * Maps whatever a failed call hands back to a { title, description } shape:
 * `toastApiError()` (sibling `error-toast.ts`) puts it straight into
 * svelte-sonner, and `describeApiError()` below flattens it to the one string
 * a banner, an `ErrorState` or a prefixed message takes.
 *
 * `description` is REQUIRED, not optional. A toast with no description renders
 * a bare title, so an optional field pushes a `?? 'something'` onto every call
 * site and each one invents its own wording; the two fallback parameters put
 * that decision where the caller already knows the answer ("Failed to load
 * invoices") and give this helper one place to default it.
 *
 * The shapes handled, all of which reach real call sites:
 *   - the backend's own envelope, { error, message, details? } (exceptions.py
 *     `_build_error_response`) — including the structured `details` mapping,
 *     which the backend ships and a caller could otherwise only render as
 *     [object Object];
 *   - the same envelope produced synthetically by client.ts's error normaliser
 *     for a network failure or a timeout, which is why it is the SAME shape:
 *     a call site cannot tell a real 503 from an unreachable API, and should
 *     not have to;
 *   - FastAPI's bare `{ detail }` from a raw HTTPException, string or (a 422)
 *     a ValidationError[];
 *   - a sentence in `error` with no `message` beside it (a guard that answers
 *     in prose, not a code);
 *   - a proxy's HTML error page (nginx, Cloudflare), which must never render
 *     raw into a toast;
 *   - a plain string body.
 *
 * A raw fetch rejection (TypeError, AbortError) never reaches here: client.ts's
 * `errorNormaliserMiddleware` turns every one into the backend-envelope shape
 * first, so this file carries no branch for the throw itself.
 */

export interface ApiErrorInfo {
	title: string;
	description: string;
}

// Codes the client's onError normaliser emits for a throwing request, mapped to
// the title a user should see. Keep in step with client.ts.
// `as const satisfies` and not a `Record<string, string>` annotation: under
// noUncheckedIndexedAccess the annotation widens the keys, so a direct
// NORMALISED_TITLES.timeout reads as possibly undefined.
const NORMALISED_TITLES = {
	network_error: 'Network error',
	timeout: 'Request timed out'
} as const satisfies Record<string, string>;

/**
 * Render the backend's structured `details` mapping as display text.
 *
 * A `detail` key wins outright — the shape a caller emits when it has one clear
 * sentence to say. Otherwise every primitive value is joined, so a mapping like
 * `{ existing_id: 42, existing_label: 'Acme Pty Ltd' }` renders something a
 * person can read. Returns undefined for a missing, empty or non-object
 * `details` so the caller falls through to the message.
 */
export function formatErrorDetails(details: unknown): string | undefined {
	if (!details || typeof details !== 'object') return undefined;
	const d = details as Record<string, unknown>;
	if (typeof d.detail === 'string') return d.detail;
	const values = Object.values(d).filter((v) => typeof v === 'string' || typeof v === 'number');
	return values.length > 0 ? values.join(', ') : undefined;
}

/**
 * Render FastAPI's 422 `ValidationError[]` as a readable field summary. A
 * field-level entry still maps onto a form field via superforms' setError()
 * (sveltekit-api-client.md §Error Handling); this is what a caller with no
 * such mapping — or a field the form does not cover — falls back to.
 */
function formatValidationErrors(detail: unknown): string | undefined {
	if (!Array.isArray(detail) || detail.length === 0) return undefined;
	const parts = detail
		.map((item) => {
			if (!item || typeof item !== 'object') return undefined;
			const entry = item as Record<string, unknown>;
			if (typeof entry.msg !== 'string') return undefined;
			const loc = Array.isArray(entry.loc) ? entry.loc : [];
			const field = loc.length > 1 ? loc[loc.length - 1] : undefined;
			return typeof field === 'string' || typeof field === 'number'
				? `${field}: ${entry.msg}`
				: entry.msg;
		})
		.filter((part): part is string => Boolean(part));
	return parts.length > 0 ? parts.join('; ') : undefined;
}

// A proxy (nginx, Cloudflare) answers a failure with its own HTML page, not
// JSON. nginx's built-in error pages open with `<html`, not `<!doctype html>`,
// so both are checked; rendering either raw would put markup in a toast.
function isHtmlPage(body: string): boolean {
	const start = body.trimStart().toLowerCase();
	return start.startsWith('<!doctype html') || start.startsWith('<html');
}

// `not_found` -> `Not Found`. Only reached for a code with no entry in
// NORMALISED_TITLES; the raw snake_case code is a developer's string, not a
// user's.
function humanise(code: string): string {
	return code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function extractApiError(
	error: unknown,
	fallbackTitle = 'Error',
	fallbackDescription = 'An error occurred'
): ApiErrorInfo {
	if (error === null || error === undefined || typeof error !== 'object') {
		if (typeof error !== 'string' || error.length === 0) {
			return { title: fallbackTitle, description: fallbackDescription };
		}
		return isHtmlPage(error)
			? {
					title: 'Service unavailable',
					description: 'The service is temporarily unavailable. Please try again shortly.'
				}
			: { title: fallbackTitle, description: error };
	}

	return extractFromBody(error as Record<string, unknown>, fallbackTitle, fallbackDescription);
}

function extractFromBody(
	d: Record<string, unknown>,
	fallbackTitle: string,
	fallbackDescription: string
): ApiErrorInfo {
	// `error` is a code ("not_found") to humanise only when it looks like one; a
	// sentence there (a guard answering in prose, e.g. "Cross-origin request
	// rejected") is the message, not a code, and must not be mangled by
	// humanise() or hidden behind a generic description.
	const code = typeof d.error === 'string' && !d.error.includes(' ') ? d.error : undefined;
	const codeTitle = code
		? (NORMALISED_TITLES[code as keyof typeof NORMALISED_TITLES] ?? humanise(code))
		: undefined;

	if (typeof d.message === 'string') {
		// The backend's full envelope. When it carries `details`, the message is
		// the headline and the details are the specifics — keeping both, rather
		// than dropping the structured half the backend went to the trouble of
		// sending.
		const detailsText = formatErrorDetails(d.details);
		return detailsText
			? { title: d.message, description: detailsText }
			: { title: codeTitle ?? fallbackTitle, description: d.message };
	}

	if (typeof d.detail === 'string') {
		// FastAPI's bare HTTPException shape.
		return { title: fallbackTitle, description: d.detail };
	}

	const validation = formatValidationErrors(d.detail);
	if (validation) {
		// FastAPI's 422 ValidationError[].
		return { title: fallbackTitle, description: validation };
	}

	if (typeof d.error === 'string' && d.error.includes(' ')) {
		return { title: fallbackTitle, description: d.error };
	}

	if (codeTitle) {
		return { title: codeTitle, description: fallbackDescription };
	}

	return { title: fallbackTitle, description: fallbackDescription };
}

/**
 * The flattened string a banner, an `ErrorState` or a prefixed message takes:
 * `${title}: ${description}`. The toast idiom is `toastApiError()` instead
 * (sibling `error-toast.ts`, which needs svelte-sonner and so stays out of
 * this file).
 */
export function describeApiError(
	error: unknown,
	fallbackTitle?: string,
	fallbackDescription?: string
): string {
	const info = extractApiError(error, fallbackTitle, fallbackDescription);
	return `${info.title}: ${info.description}`;
}
