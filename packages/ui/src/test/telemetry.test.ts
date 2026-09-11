/**
 * `initBrowserTelemetry`'s contract, with the faro modules mocked: the two
 * decisions a household app's boot depends on are asserted directly —
 *
 *   1. an app with no collector configured gets a NULL and Faro is never
 *      touched, so a private or unconfigured deployment mounts the feedback
 *      widget without shipping a single beacon;
 *   2. a second init returns the FIRST instance — faro-core refuses a second
 *      registration outright, and a remounted layout (dev HMR, a route error
 *      boundary) must not be the thing that trips it.
 *
 * `getSessionId()` is held to the same null discipline: it reads the session
 * of the instance this module holds or reports null, never throws, and is
 * what the feedback widget puts in its `session_id` field.
 *
 * The faro packages themselves are exercised nowhere in this suite by design:
 * what is pinned is the CONFIG this package chooses — session tracking on,
 * console capture off, the tracing instrumentation present — which is the
 * part this repo owns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

vi.mock('@grafana/faro-web-sdk', () => ({
	initializeFaro: vi.fn(() => ({ api: { getSession: () => ({ id: 'faro-session-1' }) } })),
	getWebInstrumentations: vi.fn(() => [{ name: 'web-vitals' }, { name: 'navigation' }])
}));

// A class, not an arrow mock: the module under test constructs it with `new`,
// which an arrow function refuses.
vi.mock('@grafana/faro-web-tracing', () => ({
	TracingInstrumentation: class {
		name = 'tracing';
	}
}));

// The instance this module holds is module state, so every test takes the
// module fresh: init in one test must not leak an instance into the next.
beforeEach(() => {
	vi.clearAllMocks();
	vi.resetModules();
});

/** A freshly-imported telemetry module — `vi.resetModules()`'s other half. */
async function freshTelemetry() {
	return await import('$lib/telemetry');
}

const OPTIONS = { app: 'cadmus', version: '2026.9.6', url: 'https://collector.example' } as const;

describe('initBrowserTelemetry', () => {
	it('returns null without a URL and never touches Faro', async () => {
		const { initBrowserTelemetry } = await freshTelemetry();

		const result = initBrowserTelemetry({ ...OPTIONS, url: '' });

		expect(result).toBeNull();
		expect(initializeFaro).not.toHaveBeenCalled();
		expect(getWebInstrumentations).not.toHaveBeenCalled();
	});

	it('initialises Faro with the household configuration', async () => {
		const { initBrowserTelemetry } = await freshTelemetry();

		const instance = initBrowserTelemetry(OPTIONS);

		expect(initializeFaro).toHaveBeenCalledTimes(1);
		expect(instance).not.toBeNull();

		const config = vi.mocked(initializeFaro).mock.calls[0][0];
		expect(config.url).toBe(OPTIONS.url);
		expect(config.app).toEqual({ name: 'cadmus', version: '2026.9.6' });
		expect(config.sessionTracking).toEqual({ enabled: true });
		// The console stays local by rule — asserted, not inherited from a
		// default that upstream could flip.
		expect(getWebInstrumentations).toHaveBeenCalledWith({ captureConsole: false });
		// Same-origin fetch and XHR carry traceparent: the tracing
		// instrumentation rides along after the web instrumentations.
		const instrumentations = config.instrumentations ?? [];
		expect(instrumentations).toEqual([{ name: 'web-vitals' }, { name: 'navigation' }, { name: 'tracing' }]);
		expect(instrumentations[2]).toBeInstanceOf(TracingInstrumentation);
	});

	it('is idempotent: a second call returns the first instance', async () => {
		const { initBrowserTelemetry } = await freshTelemetry();

		const first = initBrowserTelemetry(OPTIONS);
		const second = initBrowserTelemetry({ ...OPTIONS, url: 'https://other.example' });

		expect(initializeFaro).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});
});

describe('getSessionId', () => {
	it('returns null before anything was initialised', async () => {
		const { getSessionId } = await freshTelemetry();
		expect(getSessionId()).toBeNull();
	});

	it('returns null after a no-URL no-op init', async () => {
		const { initBrowserTelemetry, getSessionId } = await freshTelemetry();
		initBrowserTelemetry({ ...OPTIONS, url: '' });
		expect(getSessionId()).toBeNull();
	});

	it("returns Faro's current session id once initialised", async () => {
		const { initBrowserTelemetry, getSessionId } = await freshTelemetry();
		initBrowserTelemetry(OPTIONS);
		expect(getSessionId()).toBe('faro-session-1');
	});
});
