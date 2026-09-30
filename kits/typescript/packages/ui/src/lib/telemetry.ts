/**
 * Browser telemetry for a household frontend: one `initBrowserTelemetry()`
 * call in the client entry, one Faro instance for the app's lifetime.
 *
 * Both faro packages are ordinary `dependencies`, not peers: telemetry is not
 * an optional flavour a consumer chooses per route, it is part of what every
 * household app mounts, and a duplicated faro global would strand the session
 * id the feedback widget reports against.
 */
import { initializeFaro, getWebInstrumentations, type Faro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

/** What an app supplies to switch telemetry on. */
export interface BrowserTelemetryOptions {
	/** The app's name, as it should appear in Faro's app metadata. */
	app: string;
	/** The app's version — the package's own CalVer, ordinarily. */
	version: string;
	/**
	 * The Faro collector endpoint. Empty means "no collector configured" and
	 * the whole module stays inert rather than shipping beacons that error.
	 */
	url: string;
}

/** The one Faro instance this browser tab holds, once initialised. */
let faro: Faro | null = null;

/**
 * Start browser telemetry. Returns the Faro instance, or null when there is
 * no collector to send to — the caller has nothing to clean up in that case,
 * because nothing was created.
 *
 * Idempotent: a second call returns the first instance and initialises
 * nothing. A layout remount, a dev-mode HMR leg or two init calls racing in
 * different modules must not produce a second Faro global (faro-core refuses
 * a second registration outright, and the session id a second instance would
 * hand out would not be the one the first instance's events carry).
 */
export function initBrowserTelemetry({ app, version, url }: BrowserTelemetryOptions): Faro | null {
	// No URL, no telemetry. An app that was never told where the collector
	// lives ships a silent no-op rather than a transport that fails on every
	// send — the call sites never branch on this; `getSessionId()` reads the
	// same null either way.
	if (!url) return null;

	if (faro) return faro;

	faro = initializeFaro({
		url,
		app: { name: app, version },
		// Session tracking is Faro's default too, but the feedback widget's
		// payload carries the session id, so the guarantee is stated here
		// rather than inherited from a default that could change upstream.
		sessionTracking: { enabled: true },
		instrumentations: [
			...getWebInstrumentations({
				// The console stays local by rule: a household app's logs are not
				// shipped to the collector, only errors, events and measurements.
				captureConsole: false
			}),
			// W3C trace context on same-origin fetch and XHR: every request the
			// app's own backend serves carries a `traceparent`, so a feedback
			// report can be correlated with the server-side trace of the page
			// it was sent from.
			new TracingInstrumentation()
		]
	});

	return faro;
}

/**
 * Faro's current session id, or null when telemetry is not running (no URL, or
 * init not yet called). The null leg is ordinary, not an error: the feedback
 * widget's `session_id` field carries it as null and the report still sends.
 */
export function getSessionId(): string | null {
	return faro?.api.getSession()?.id ?? null;
}
