/**
 * API error extraction utility.
 *
 * Maps whatever a failed call hands back to a { title, description, status? }
 * shape usable with svelte-sonner: toast.error(info.title, { description: info.description }).
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
 *   - FastAPI's bare `{ detail }` from a raw HTTPException;
 *   - a proxy's HTML error page (nginx, Cloudflare), which must never render
 *     raw into a toast;
 *   - a plain string body;
 *   - a raw fetch rejection (TypeError / AbortError) reaching here directly;
 *   - the bare parsed body openapi-fetch hands most call sites AND the
 *     { status, body } wrapper some construct by hand.
 */

export interface ApiErrorInfo {
	title: string;
	description: string;
	status?: number;
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

// `not_found` -> `Not Found`. Only reached for a code with no entry in
// NORMALISED_TITLES; the raw snake_case code is a developer's string, not a
// user's, and rendering it into a toast was the previous behaviour.
function humanise(code: string): string {
	return code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function extractApiError(
	error: unknown,
	fallbackTitle = 'Error',
	fallbackDescription = 'An error occurred'
): ApiErrorInfo {
	// A raw throw is checked FIRST: an Error is an object carrying a string
	// `message`, so the envelope branch below would swallow it and report a
	// network failure as a generic "Error".
	if (error instanceof DOMException && error.name === 'AbortError') {
		return {
			title: NORMALISED_TITLES.timeout,
			description: 'The request took too long and was cancelled.'
		};
	}
	if (error instanceof TypeError) {
		return { title: NORMALISED_TITLES.network_error, description: error.message };
	}

	if (error === null || error === undefined || typeof error !== 'object') {
		return typeof error === 'string' && error.length > 0
			? { title: fallbackTitle, description: error }
			: { title: fallbackTitle, description: fallbackDescription };
	}

	// openapi-fetch hands most call sites the bare parsed error body (e.g.
	// `{ detail: 'Not found' }`) with no `status` on it at all — the status lives
	// on the sibling Response, which this helper never receives. A minority of
	// call sites wrap it as `{ status, body }` instead. Normalise both into a
	// body to inspect and an optional status to enrich the result with. `status`
	// must never gate whether the body is read: it only ever adds.
	const wrapper = error as Record<string, unknown>;
	const status = typeof wrapper.status === 'number' ? wrapper.status : undefined;
	const body = 'body' in wrapper ? wrapper.body : error;

	return { ...extractFromBody(body, fallbackTitle, fallbackDescription, status), status };
}

function extractFromBody(
	body: unknown,
	fallbackTitle: string,
	fallbackDescription: string,
	status: number | undefined
): { title: string; description: string } {
	const withStatus = (description: string) =>
		status ? `${description} (HTTP ${status})` : description;

	if (body === null || body === undefined) {
		return { title: fallbackTitle, description: withStatus(fallbackDescription) };
	}

	if (typeof body === 'string') {
		// A proxy (nginx, Cloudflare) answers with a page, not JSON. Rendering it
		// raw puts markup in a toast, so it is reported as what it is.
		if (body.trimStart().toLowerCase().startsWith('<!doctype html')) {
			return {
				title: 'Service unavailable',
				description: 'The service is temporarily unavailable. Please try again shortly.'
			};
		}
		return { title: fallbackTitle, description: body };
	}

	if (typeof body !== 'object') {
		return { title: fallbackTitle, description: String(body) };
	}

	const d = body as Record<string, unknown>;
	const code = typeof d.error === 'string' ? d.error : undefined;
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
	// A non-string `detail` is FastAPI's 422 ValidationError[], deliberately not
	// stringified: an array must never render raw into a toast. Field-level 422s
	// map to form errors at the call site via superforms' setError()
	// (rules-library/stacks/sveltekit-api-client.md §Error Handling).

	if (codeTitle) {
		return { title: codeTitle, description: withStatus(fallbackDescription) };
	}

	return { title: fallbackTitle, description: withStatus(fallbackDescription) };
}
