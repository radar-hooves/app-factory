/**
 * API error extraction utility.
 *
 * Maps an openapi-fetch error payload to a { title, description, status? }
 * shape usable with svelte-sonner: toast.error(info.title, { description: info.description }).
 */

export interface ApiErrorInfo {
  title: string;
  description?: string;
  status?: number;
}

// Codes the client's onError normaliser emits for a throwing request, mapped to
// the title a user should see. Keep in step with client.ts.
// `as const satisfies` and not a `Record<string, string>` annotation: under
// noUncheckedIndexedAccess the annotation widens the keys, so a direct
// NORMALISED_TITLES.timeout reads as possibly undefined.
const NORMALISED_TITLES = {
  network_error: 'Network error',
  timeout: 'Request timed out',
} as const satisfies Record<string, string>;

export function extractApiError(error: unknown, status?: number): ApiErrorInfo {
  // A raw throw is checked FIRST: an Error is an object carrying a string
  // `message`, so the envelope branch below would swallow it and report a
  // network failure as a generic "Error".
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { title: NORMALISED_TITLES.timeout, description: 'The request took too long and was cancelled.', status };
  }
  if (error instanceof TypeError) {
    return { title: NORMALISED_TITLES.network_error, description: error.message, status };
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string') {
      const code = typeof e.error === 'string' ? e.error : undefined;
      const known = code ? NORMALISED_TITLES[code as keyof typeof NORMALISED_TITLES] : undefined;
      return { title: known ?? code ?? 'Error', description: e.message, status };
    }
    // FastAPI's own error shape, which carries `detail` rather than `message`.
    if (typeof e.detail === 'string') {
      return { title: 'Error', description: e.detail, status };
    }
  }

  return { title: 'Unexpected error', description: String(error), status };
}
