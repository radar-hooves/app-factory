import { describe, expect, it } from 'vitest';

import { extractApiError, formatErrorDetails } from './error';

// The scaffold's example unit test — extend it as this app's own error shapes
// appear, rather than deleting it: every case below is a shape the factory's
// backend, client or proxy actually produces, so they hold for every app.
describe('extractApiError', () => {
	it('maps the backend error envelope to a toast-ready shape', () => {
		const info = extractApiError({ error: 'not_found', message: 'No such item' });
		expect(info).toEqual({ title: 'Not Found', description: 'No such item', status: undefined });
	});

	it("gives the client's normalised network code a human title", () => {
		const info = extractApiError({ error: 'network_error', message: 'Could not reach the API.' });
		expect(info.title).toBe('Network error');
	});

	it("maps FastAPI's bare detail payload", () => {
		expect(extractApiError({ detail: 'Unprocessable' })).toEqual({
			title: 'Error',
			description: 'Unprocessable',
			status: undefined
		});
	});

	// A raw TypeError is an object with a string `message`, so it reaches this
	// helper looking exactly like a backend envelope. The ordering inside
	// extractApiError is what keeps them apart.
	it('reports a raw fetch rejection as a network error, not a generic one', () => {
		expect(extractApiError(new TypeError('Failed to fetch'))).toEqual({
			title: 'Network error',
			description: 'Failed to fetch'
		});
	});

	it('falls back to a string rendering of anything else', () => {
		expect(extractApiError('boom')).toEqual({ title: 'Error', description: 'boom' });
	});

	describe('the caller-supplied fallbacks', () => {
		it('uses them when the payload says nothing usable', () => {
			expect(
				extractApiError({}, 'Failed to load invoices', 'The invoice list is unavailable')
			).toEqual({
				title: 'Failed to load invoices',
				description: 'The invoice list is unavailable',
				status: undefined
			});
		});

		it('appends the status to a fallback description, so a bare failure is still diagnosable', () => {
			const info = extractApiError({ status: 502, body: {} }, 'Failed to save', 'Could not save');
			expect(info).toEqual({
				title: 'Failed to save',
				description: 'Could not save (HTTP 502)',
				status: 502
			});
		});

		it('never overrides a real message with a fallback', () => {
			const info = extractApiError({ detail: 'Row is locked' }, 'Failed to save', 'Could not save');
			expect(info.description).toBe('Row is locked');
		});
	});

	describe("the backend's structured details mapping", () => {
		it('promotes the message to the title and renders the details beneath it', () => {
			const info = extractApiError({
				error: 'conflict',
				message: 'That name is already taken',
				details: { existing_id: 42, existing_label: 'Acme Pty Ltd' }
			});
			expect(info).toEqual({
				title: 'That name is already taken',
				description: '42, Acme Pty Ltd',
				status: undefined
			});
		});

		it('lets a single detail key speak for the whole mapping', () => {
			const info = extractApiError({
				error: 'unavailable',
				message: 'Upstream refused',
				details: { detail: 'signet is not on PATH' }
			});
			expect(info.description).toBe('signet is not on PATH');
		});

		it('falls through to the message when details carry nothing renderable', () => {
			const info = extractApiError({
				error: 'bad_request',
				message: 'Bad request',
				details: { nested: { too: 'deep' } }
			});
			expect(info).toEqual({ title: 'Bad Request', description: 'Bad request', status: undefined });
		});
	});

	describe('the { status, body } wrapper some call sites construct', () => {
		it('reads the body through the wrapper and keeps the status', () => {
			const info = extractApiError({ status: 404, body: { error: 'not_found', message: 'Gone' } });
			expect(info).toEqual({ title: 'Not Found', description: 'Gone', status: 404 });
		});

		it('reads a bare body with no wrapper the same way', () => {
			const info = extractApiError({ error: 'not_found', message: 'Gone' });
			expect(info.description).toBe('Gone');
		});
	});

	it("reports a proxy's HTML error page as a service failure, never as markup", () => {
		const page = '<!DOCTYPE html>\n<html><head><title>502 Bad Gateway</title></head></html>';
		const info = extractApiError({ status: 502, body: page });
		expect(info.title).toBe('Service unavailable');
		expect(info.description).not.toContain('<');
	});

	it('renders a plain string body as the description', () => {
		expect(extractApiError({ status: 500, body: 'upstream exploded' }).description).toBe(
			'upstream exploded'
		);
	});

	it('never stringifies a 422 ValidationError array into a toast', () => {
		const info = extractApiError({
			status: 422,
			body: { detail: [{ loc: ['body', 'name'], msg: 'field required' }] }
		});
		expect(info.description).toBe('An error occurred (HTTP 422)');
		expect(info.description).not.toContain('[object Object]');
	});

	it('handles null and undefined without throwing', () => {
		expect(extractApiError(null).description).toBe('An error occurred');
		expect(extractApiError(undefined, 'Nope').title).toBe('Nope');
	});
});

describe('formatErrorDetails', () => {
	it('returns undefined for anything that is not a populated mapping', () => {
		expect(formatErrorDetails(undefined)).toBeUndefined();
		expect(formatErrorDetails(null)).toBeUndefined();
		expect(formatErrorDetails('a string')).toBeUndefined();
		expect(formatErrorDetails({})).toBeUndefined();
		expect(formatErrorDetails({ nested: { too: 'deep' } })).toBeUndefined();
	});

	it('prefers a detail key over joining the rest', () => {
		expect(formatErrorDetails({ detail: 'the reason', other: 'ignored' })).toBe('the reason');
	});

	it('joins primitive values so a mapping never renders as [object Object]', () => {
		expect(formatErrorDetails({ field: 'name', limit: 64 })).toBe('name, 64');
	});
});
