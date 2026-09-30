/**
 * The `avatar` primitive.
 *
 * It exists because AppShell defines an `identity` slot and building that slot
 * needs an avatar; without one in the package, every consumer kept a private
 * copy of the upstream primitive purely to fill a slot the shell itself asks
 * for. In the app that reported it, that copy was the sole survivor of a
 * hundred-file vendored folder — a file that can never receive an upstream fix.
 *
 * Two claims, and the second is the one a render-only check cannot make.
 *
 * The load-state swap is a state machine, not markup: mount it, and whatever
 * you assert is true of the FIRST frame regardless of whether the component
 * ever swaps. So the machine is driven here rather than observed — `Image` is
 * stubbed with one whose `onload`/`onerror` the test fires, which is the exact
 * code path bits-ui takes (`new Image(); image.src = …; image.onerror = …`), and
 * both legs are asserted on what is actually VISIBLE afterwards. jsdom loads no
 * resources, so without the stub neither event ever fires and both legs would
 * pass vacuously on a component that never swaps.
 *
 * The real network legs — a genuine 404 and a genuine image — are driven in a
 * real engine (`harness/drive.md`, `?surface=avatar`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import AvatarHarness from './avatar.svelte';

/** The `new Image()` instances bits-ui created, newest last. */
let loaders: FakeImage[] = [];
const RealImage = globalThis.Image;

class FakeImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	crossOrigin: string | undefined;
	referrerPolicy: string | undefined;
	#src = '';
	get src() {
		return this.#src;
	}
	set src(value: string) {
		this.#src = value;
		loaders.push(this);
	}
}

beforeEach(() => {
	loaders = [];
	vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
	vi.stubGlobal('Image', RealImage);
});

/** The element carrying `slot`, or null. */
function slot(name: string): HTMLElement | null {
	return document.querySelector(`[data-slot="${name}"]`);
}

describe('avatar barrel export', () => {
	it('mounts the styled wrappers, not the bits-ui namespace object', () => {
		// The defect this mirrors is the checkbox one: re-exporting bits-ui's
		// compound namespace under the wrapper's name yields a plain object that
		// Svelte cannot mount, and a namespace `.Root` that mounts fine while
		// carrying none of this package's styling. The slot markers are what tell
		// the two apart — only this package's wrappers write them.
		render(AvatarHarness);

		expect(slot('avatar')).not.toBeNull();
		expect(slot('avatar-fallback')).not.toBeNull();
		expect(screen.getByText('OP')).toBeInTheDocument();
	});
});

describe('avatar load state', () => {
	it('shows the fallback when the source cannot resolve', async () => {
		render(AvatarHarness, { props: { src: 'https://example.invalid/missing.png' } });

		await waitFor(() => expect(loaders.length).toBe(1));
		loaders[0].onerror?.();

		await waitFor(() => {
			expect(slot('avatar')?.getAttribute('data-status')).toBe('error');
		});
		// Visible content, not merely presence: the image is in the DOM either way
		// and the whole question is which one the eye lands on.
		expect(slot('avatar-image')?.style.display).toBe('none');
		expect(slot('avatar-fallback')?.style.display).not.toBe('none');
		expect(screen.getByText('OP')).toBeInTheDocument();
	});

	it('hands over to the image once it loads', async () => {
		render(AvatarHarness, { props: { src: 'https://example.test/operator.png' } });

		await waitFor(() => expect(loaders.length).toBe(1));
		loaders[0].onload?.();

		await waitFor(() => {
			expect(slot('avatar')?.getAttribute('data-status')).toBe('loaded');
		});
		expect(slot('avatar-image')?.style.display).toBe('block');
		expect(slot('avatar-fallback')?.style.display).toBe('none');
	});

	it('shows the fallback with no source at all', async () => {
		// The commonest case in practice: an identity provider that serves no
		// picture. Nothing is ever requested, so the swap must not depend on one.
		render(AvatarHarness);

		await waitFor(() => {
			expect(slot('avatar-fallback')).not.toBeNull();
		});
		expect(slot('avatar-image')).toBeNull();
		expect(screen.getByText('OP')).toBeVisible();
	});
});
