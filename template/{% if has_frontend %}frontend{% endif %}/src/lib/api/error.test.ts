import { describe, expect, it } from 'vitest';
import { extractApiError } from './error';

// The scaffold's example unit test — delete it once this app has real ones.
// It exists so a freshly stamped app has a vitest run that passes, and a
// worked example of the shape the suite expects.
describe('extractApiError', () => {
  it('maps the backend error envelope to a toast-ready shape', () => {
    const info = extractApiError({ error: 'not_found', message: 'No such item' }, 404);
    expect(info).toEqual({ title: 'not_found', description: 'No such item', status: 404 });
  });

  it("maps FastAPI's bare detail payload", () => {
    expect(extractApiError({ detail: 'Unprocessable' }, 422)).toEqual({
      title: 'Error',
      description: 'Unprocessable',
      status: 422,
    });
  });

  it('reports a fetch failure as a network error', () => {
    expect(extractApiError(new TypeError('Failed to fetch'))).toEqual({
      title: 'Network error',
      description: 'Failed to fetch',
    });
  });

  it('falls back to a string rendering of anything else', () => {
    expect(extractApiError('boom', 500)).toEqual({
      title: 'Unexpected error',
      description: 'boom',
      status: 500,
    });
  });
});
