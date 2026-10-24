import { afterEach } from 'vitest';

const stub = window.matchMedia;

/**
 * A window `rem` wide, as the shell's `(min-width: Nrem)` queries read it. The
 * setup file stubs `matchMedia` as never matching (a narrow window); this
 * answers min-width queries for the width given, and restores the stub after
 * each test.
 */
export function windowWidth(rem: number): void {
	window.matchMedia = ((query: string) => {
		const min = Number(/min-width:\s*([\d.]+)rem/.exec(query)?.[1] ?? Infinity);
		return {
			matches: rem >= min,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {}
		};
	}) as unknown as typeof window.matchMedia;
}

afterEach(() => {
	window.matchMedia = stub;
});
