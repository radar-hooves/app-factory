import { describe, expect, it } from 'vitest';

import { describeApiError, extractApiError, formatErrorDetails } from './error';

// The scaffold's example unit test — extend it as this app's own error shapes
// appear, rather than deleting it: every case below is a shape the factory's
// backend, client or proxy actually produces, so they hold for every app.
describe('extractApiError', () => {
	it('maps the backend error envelope to a toast-ready shape', () => {
		const info = extractApiError({ error: 'not_found', message: 'No such item' });
		expect(info).toEqual({ title: 'Not Found', description: 'No such item' });
	});

	it("gives the client's normalised network code a human title", () => {
		const info = extractApiError({ error: 'network_error', message: 'Could not reach the API.' });
		expect(info.title).toBe('Network error');
	});

	it("maps FastAPI's bare detail payload", () => {
		expect(extractApiError({ detail: 'Unprocessable' })).toEqual({
			title: 'Error',
			description: 'Unprocessable'
		});
	});

	it('falls back to a string rendering of anything else', () => {
		expect(extractApiError('boom')).toEqual({ title: 'Error', description: 'boom' });
	});

	it('treats a message-shaped `error` as the description, not a code to humanise', () => {
		// pebblestone's Origin guard answers a rejected cross-origin request with
		// exactly this shape: a sentence in `error`, no `message` beside it.
		const info = extractApiError({ error: 'Cross-origin request rejected' });
		expect(info).toEqual({ title: 'Error', description: 'Cross-origin request rejected' });
	});

	describe('the caller-supplied fallbacks', () => {
		it('uses them when the payload says nothing usable', () => {
			expect(
				extractApiError({}, 'Failed to load invoices', 'The invoice list is unavailable')
			).toEqual({
				title: 'Failed to load invoices',
				description: 'The invoice list is unavailable'
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
				description: '42, Acme Pty Ltd'
			});
		});

		it('lets a single detail key speak for the whole mapping', () => {
			const info = extractApiError({
				error: 'unavailable',
				message: 'Upstream refused',
				details: { detail: 'no software identity key' }
			});
			expect(info.description).toBe('no software identity key');
		});

		it('falls through to the message when details carry nothing renderable', () => {
			const info = extractApiError({
				error: 'bad_request',
				message: 'Bad request',
				details: { nested: { too: 'deep' } }
			});
			expect(info).toEqual({ title: 'Bad Request', description: 'Bad request' });
		});
	});

	describe("FastAPI's 422 ValidationError[]", () => {
		it('renders a single field error as a readable summary', () => {
			const info = extractApiError({
				detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'missing' }]
			});
			expect(info).toEqual({ title: 'Error', description: 'name: field required' });
		});

		it('joins several field errors, never as [object Object]', () => {
			const info = extractApiError({
				detail: [
					{ loc: ['body', 'name'], msg: 'field required', type: 'missing' },
					{ loc: ['body', 'email'], msg: 'invalid format', type: 'value_error' }
				]
			});
			expect(info.description).toBe('name: field required; email: invalid format');
			expect(info.description).not.toContain('[object Object]');
		});

		it('falls back to the fallback description when the array carries nothing renderable', () => {
			const info = extractApiError({ detail: [{}] }, 'Failed to save', 'Could not save');
			expect(info).toEqual({ title: 'Failed to save', description: 'Could not save' });
		});
	});

	describe("a proxy's HTML error page", () => {
		it("reports nginx's built-in 502 page as a service failure, never as markup", () => {
			// nginx's own error pages open with `<html`, not `<!doctype html>`.
			const page = '<html><head><title>502 Bad Gateway</title></head></html>';
			const info = extractApiError(page);
			expect(info.title).toBe('Service unavailable');
			expect(info.description).not.toContain('<');
		});

		it('reports a `<!doctype html>` page the same way', () => {
			const page = '<!DOCTYPE html>\n<html><head><title>502 Bad Gateway</title></head></html>';
			const info = extractApiError(page);
			expect(info.title).toBe('Service unavailable');
			expect(info.description).not.toContain('<');
		});
	});

	it('handles null and undefined without throwing', () => {
		expect(extractApiError(null).description).toBe('An error occurred');
		expect(extractApiError(undefined, 'Nope').title).toBe('Nope');
	});
});

describe('describeApiError', () => {
	it('flattens title and description into the one string a banner or ErrorState takes', () => {
		expect(describeApiError({ detail: 'Row is locked' }, 'Failed to save')).toBe(
			'Failed to save: Row is locked'
		);
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
