/**
 * API error extraction utility.
 *
 * Maps openapi-fetch error payloads to a { title, description, status? }
 * shape usable with svelte-sonner: toast.error(info.title, { description: info.description }).
 */

export interface ApiError {
  title: string;
  description?: string;
  status?: number;
}

export function extractApiError(error: unknown, status?: number): ApiError {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string') {
      return { title: e.error as string ?? 'Error', description: e.message, status };
    }
    if (typeof e.detail === 'string') {
      return { title: 'Error', description: e.detail, status };
    }
  }
  if (error instanceof TypeError) {
    return { title: 'Network error', description: error.message };
  }
  return { title: 'Unexpected error', description: String(error), status };
}
