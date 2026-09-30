import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { vi, afterEach } from 'vitest';

afterEach(async () => {
	cleanup();
	// bits-ui does not restore the body style when a scroll lock releases; it
	// schedules the restore on a 24ms timer, so that a same-tick destroy/create
	// (bits-ui#1639) does not flicker. `cleanup()` is synchronous, so a test file
	// whose last test unmounted a locking overlay — a dialogue, a palette, the
	// mobile drawer — can finish with that timer still pending. It then fires
	// against a torn-down jsdom and throws `document is not defined` as an
	// unhandled error, failing the run from outside any test.
	//
	// bits-ui writes `--scrollbar-width` onto the body for exactly as long as a
	// restore is outstanding, so it is the one signal that means "a timer is
	// still coming" and only the tests that opened something pay for the wait.
	// Read off the style ATTRIBUTE, not `style.getPropertyValue`: jsdom's
	// CSSStyleDeclaration does not expose custom properties, so the obvious
	// spelling returns '' on a locked body and the guard silently never fires.
	// Measured — 6 of app-shell's afterEach runs hold a lock, the rest do not.
	if (document.body.getAttribute('style')?.includes('--scrollbar-width')) {
		await new Promise((resolve) => setTimeout(resolve, 32));
	}
});

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}))
});

globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn()
})) as unknown as typeof IntersectionObserver;

class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

Element.prototype.scrollIntoView = vi.fn();

Element.prototype.animate = vi.fn(() => ({
	finished: Promise.resolve(),
	cancel: () => {},
	pause: () => {},
	play: () => {}
})) as unknown as typeof Element.prototype.animate;

Element.prototype.hasPointerCapture = vi.fn();
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
