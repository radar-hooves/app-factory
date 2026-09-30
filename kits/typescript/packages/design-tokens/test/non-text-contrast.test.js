/**
 * Non-text contrast for the elements that BOUND and SEPARATE content
 * (design-system#17).
 *
 * The sibling `contrast.test.js` gates ink on surfaces. Nothing gated the
 * surfaces and borders themselves, and the consequence was measured in a
 * consuming app across eight routes and 119 non-text checks: a card sat at
 * 1.02:1 against the page it was on, borders at 1.28-1.75:1. Every text check
 * on those same routes passed, which is exactly why it survived — the defect
 * is invisible to a gate that only ever looks at ink.
 *
 * The three floors below are not one number applied three times, and the
 * difference is the whole design decision:
 *
 *   border-strong  3:1   WCAG 1.4.11 sets 3:1 for the visual boundary of a
 *                        user-interface component. `border-strong` is the
 *                        token that bounds a CONTROL, so it carries the
 *                        normative floor.
 *   border         1.5:1 The hairline that separates content — table rules,
 *                        card edges, dividers. 1.4.11 does not reach a
 *                        decorative boundary, and a 3:1 hairline under every
 *                        card is a different design language, not this one.
 *                        It still has to be SEEN, hence a real floor rather
 *                        than none.
 *   surfaces       1.2:1 A fill is not a "graphical object" under 1.4.11
 *                        either, so this floor is perceptibility rather than
 *                        conformance: 1.02:1 is not elevation, it is the same
 *                        colour twice. surface-1 is the RECESSED rung and
 *                        carries a lower floor deliberately — a muted fill is
 *                        meant to be subtle.
 *
 * `border`/`border-strong` are measured only against the surfaces that hold
 * bordered content (the canvas, the card, the popover). surface-1 is a muted
 * fill nothing is bordered against, and including it would force one token to
 * clear a floor in both directions at once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '../lib/contrast-math.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(repoRoot, 'dist', 'tokens.css'), 'utf8');

const darkStart = css.indexOf('.dark {');
const BLOCKS = { light: css.slice(0, darkStart), dark: css.slice(darkStart) };

function colourValue(block, name) {
	const match = new RegExp(`--ds-color-${name}:\\s*(oklch\\([^)]*\\))`).exec(block);
	if (!match) throw new Error(`--ds-color-${name} not found in the expected block`);
	return match[1];
}

/** Surfaces that hold bordered content. Deliberately excludes surface-1. */
const BOUNDED = ['background', 'surface-2', 'surface-3'];
const BORDER_FLOORS = { border: 1.5, 'border-strong': 3.0 };
/** Elevated rungs carry the real floor; the recessed rung is meant to be subtle. */
const SURFACE_FLOORS = { 'surface-1': 1.06, 'surface-2': 1.2, 'surface-3': 1.2 };

for (const [mode, block] of Object.entries(BLOCKS)) {
	test(`every surface separates from the ${mode} page`, () => {
		const background = colourValue(block, 'background');
		const failing = [];
		for (const [surface, floor] of Object.entries(SURFACE_FLOORS)) {
			const ratio = contrastRatio(colourValue(block, surface), background);
			if (ratio < floor) failing.push(`${surface}: ${ratio.toFixed(2)}:1 (floor ${floor})`);
		}
		assert.deepEqual(failing, [], `${mode} surfaces indistinguishable from the page: ${failing.join(', ')}`);
	});

	for (const [borderToken, floor] of Object.entries(BORDER_FLOORS)) {
		test(`${borderToken} clears ${floor}:1 against every ${mode} surface it bounds`, () => {
			const border = colourValue(block, borderToken);
			const failing = [];
			for (const surface of BOUNDED) {
				const ratio = contrastRatio(border, colourValue(block, surface));
				if (ratio < floor) failing.push(`${surface}: ${ratio.toFixed(2)}:1`);
			}
			assert.deepEqual(failing, [], `${mode} ${borderToken} fails ${floor}:1 against: ${failing.join(', ')}`);
		});
	}

	test(`the ${mode} surface ladder climbs — a popover sits above a card`, () => {
		// The direction is the claim, not just the gap. The shipped light ladder
		// had surface-3 DARKER than surface-2, so the most elevated rung read as
		// the most recessed one.
		const [card, popover] = ['surface-2', 'surface-3'].map((n) => colourValue(block, n));
		const background = colourValue(block, 'background');
		const away = (c) => contrastRatio(c, background);
		assert.ok(
			away(popover) >= away(card),
			`${mode}: popover ${away(popover).toFixed(2)}:1 from the page, card ${away(card).toFixed(2)}:1 — the popover must be at least as far off the page as the card`
		);
	});
}
