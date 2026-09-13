import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock() is hoisted above every import in this file, including a plain
// `const` — only a value from vi.hoisted() is safe for its factory to close over.
const { mockInitBrowserTelemetry } = vi.hoisted(() => ({ mockInitBrowserTelemetry: vi.fn() }));
vi.mock('@poodle64/ui/telemetry', () => ({ initBrowserTelemetry: mockInitBrowserTelemetry }));

// Importing the module is what fires the top-level initBrowserTelemetry()
// call under test below — hooks.client runs it once, at module evaluation,
// not inside a function this file could call directly.
import { handleError, isStaleChunkError, mayAttemptReload } from './hooks.client';

describe('browser telemetry', () => {
	it('starts once per app load, with the build version and no collector URL in dev', () => {
		expect(mockInitBrowserTelemetry).toHaveBeenCalledTimes(1);
		const [config] = mockInitBrowserTelemetry.mock.calls[0] as [
			{ app: string; version: string; url: string }
		];
		expect(config.app.length).toBeGreaterThan(0);
		expect(config.version).toBe('test'); // $app/environment's mocked build version
		expect(config.url).toBe(''); // no collector to send to in dev
	});
});

describe('isStaleChunkError', () => {
	// Real messages emitted when a deploy has replaced the chunk a still-open tab
	// is asking for. Each engine words this differently and none carry a code.
	it.each([
		['Chromium', 'Failed to fetch dynamically imported module: /_app/immutable/nodes/12.abc123.js'],
		['Firefox', 'error loading dynamically imported module'],
		['Safari', 'Importing a module script failed.'],
		[
			'Chromium, wrong MIME type',
			'Failed to load module script: Expected a JavaScript module script'
		]
	])('detects a stale chunk on %s', (_engine, message) => {
		expect(isStaleChunkError(new Error(message))).toBe(true);
	});

	it('matches regardless of message casing', () => {
		expect(isStaleChunkError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true);
	});

	it('accepts a bare string, since a thrown non-Error still reaches handleError', () => {
		expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true);
	});

	// The reload path hides whatever error triggered it, so over-matching would
	// silently swallow real application failures. These must all reach the page.
	it.each([
		['a generic network failure', new Error('Failed to fetch')],
		['an API error', new Error('Request failed with status 500')],
		['a type error', new TypeError("Cannot read properties of undefined (reading 'id')")],
		['an unrelated import phrase', new Error('module not found')],
		['an empty message', new Error('')],
		['null', null],
		['undefined', undefined],
		['a plain object', { message: 'Failed to fetch dynamically imported module' }]
	])('does not treat %s as a stale chunk', (_case, error) => {
		expect(isStaleChunkError(error)).toBe(false);
	});
});

describe('mayAttemptReload', () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it('allows the first attempt and refuses a second inside the cooldown', () => {
		expect(mayAttemptReload(1_000_000)).toBe(true);
		expect(mayAttemptReload(1_005_000)).toBe(false);
	});

	it('allows another attempt once the cooldown has elapsed', () => {
		expect(mayAttemptReload(1_000_000)).toBe(true);
		expect(mayAttemptReload(1_020_000)).toBe(true);
	});
});

describe('handleError', () => {
	const reload = vi.fn();

	beforeEach(() => {
		sessionStorage.clear();
		reload.mockClear();
		// jsdom's location.reload is not writable; replace the object wholesale.
		Object.defineProperty(window, 'location', {
			configurable: true,
			writable: true,
			value: { ...window.location, reload }
		});
	});

	const chunkFailure = () =>
		handleError({
			error: new Error('Failed to fetch dynamically imported module'),
			message: 'Internal Error'
		} as Parameters<typeof handleError>[0]);

	it('reloads once and reports the recovery, not the raw failure', () => {
		expect(chunkFailure()).toEqual({ message: 'Updating to the latest version…' });
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload a second time while the cooldown marker stands', () => {
		chunkFailure();
		const second = chunkFailure();

		expect(reload).toHaveBeenCalledTimes(1);
		// The second failure falls through to the error page, which is correct:
		// a fresh manifest that still cannot load the chunk is a real failure.
		expect(second).toEqual({ message: 'Internal Error' });
	});

	it('leaves a genuine application error untouched', () => {
		const result = handleError({
			error: new TypeError("Cannot read properties of undefined (reading 'id')"),
			message: 'Internal Error'
		} as Parameters<typeof handleError>[0]);

		expect(reload).not.toHaveBeenCalled();
		expect(result).toEqual({ message: 'Internal Error' });
	});
});
