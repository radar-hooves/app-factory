/**
 * WCAG AA contrast floor for muted-foreground against every surface it
 * paints on (design-system#13).
 *
 * `muted-foreground` is this package's secondary-text colour — descriptions,
 * captions, timestamps, helper copy — used in every consuming app on the
 * default palette, no per-app override involved. jsdom and a compiled-CSS
 * gate both prove a rule exists; neither resolves an actual colour, so
 * neither can make this claim. This test computes the real contrast ratio
 * from the built token values (oklch -> linear sRGB -> WCAG relative
 * luminance), the same maths a browser's compositor runs, and asserts the
 * 4.5:1 AA floor for normal text directly against the token source rather
 * than only where one consumer happens to paint it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '../lib/contrast-math.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(repoRoot, 'dist', 'tokens.css'), 'utf8');

const AA_NORMAL_TEXT = 4.5;

/** Split the built stylesheet into its :root (light) and .dark blocks. */
const darkStart = css.indexOf('.dark {');
const lightBlock = css.slice(0, darkStart);
const darkBlock = css.slice(darkStart);

/** The declared value of `--ds-color-<name>` within `block`. */
function colourValue(block, name) {
	const match = new RegExp(`--ds-color-${name}:\\s*(oklch\\([^)]*\\))`).exec(block);
	if (!match) throw new Error(`--ds-color-${name} not found in the expected block`);
	return match[1];
}

const SURFACES = ['background', 'surface-1', 'surface-2', 'surface-3'];

for (const [mode, block] of [
	['light', lightBlock],
	['dark', darkBlock]
]) {
	const mutedForeground = colourValue(block, 'muted-foreground');

	test(`muted-foreground clears AA (${AA_NORMAL_TEXT}:1) against every ${mode} surface`, () => {
		const failing = [];
		for (const surface of SURFACES) {
			const ratio = contrastRatio(mutedForeground, colourValue(block, surface));
			if (ratio < AA_NORMAL_TEXT) {
				failing.push(`${surface}: ${ratio.toFixed(2)}:1`);
			}
		}
		assert.deepEqual(
			failing,
			[],
			`muted-foreground (${mode}) fails AA against: ${failing.join(', ')}`
		);
	});
}
