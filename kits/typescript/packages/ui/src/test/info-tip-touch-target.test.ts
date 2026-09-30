/**
 * Gate: the bare InfoTip trigger carries a thumb-sized hit area.
 *
 * The icon trigger's only content is a 14–16 px glyph, so its button was
 * exactly that size — well under Apple's 44 pt Human Interface Guidelines
 * floor — on every consumer's page header that passes `info`, and on every
 * other surface reaching for the bare form. Measured on one adopting app at
 * 390 px: one undersized control per screen, six screens, all of them this
 * button.
 *
 * It is the class of defect a static look never finds: the glyph is the right
 * size, the row is the right height, the tooltip opens. Only the hit box is
 * wrong, and only a thumb notices.
 *
 * The fix is `size-11` plus an equal negative margin, so the button measures
 * 44x44 and occupies the glyph's 16 px in the layout it sits in. The negative
 * margin is asserted beside the size for that reason: `size-11` alone would
 * move every header, meta row and inline caption the tip appears in, which is
 * the change that would get it reverted.
 *
 * The children form is asserted NOT to carry it: there the trigger wraps an
 * affordance the app already sized and placed, and a 44 px box around a status
 * dot inline in a sentence moves the sentence.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import InfoTipCases from './info-tip-cases.svelte';

describe('InfoTip trigger hit area', () => {
	it('gives the bare icon trigger a 44x44 box that costs the layout nothing', () => {
		render(InfoTipCases, { bare: 'What this column means.' });

		const trigger = screen.getByText('What this column means.').closest('button');
		expect(trigger).not.toBeNull();
		const classes = trigger!.className.split(/\s+/);

		// 44 px in both axes: the HIG floor.
		expect(classes).toContain('size-11');
		// Handed straight back, so nothing around it moves.
		expect(classes).toContain('-m-3.5');
		// And the glyph stays centred in the larger box.
		expect(classes).toContain('justify-center');
	});

	it('leaves a wrapped affordance at the size the app gave it', () => {
		render(InfoTipCases, { wrapped: 'This lane is parked.' });

		const trigger = screen.getByText('This lane is parked.').closest('button');
		expect(trigger).not.toBeNull();
		const classes = trigger!.className.split(/\s+/);

		expect(classes).not.toContain('size-11');
		expect(classes).not.toContain('-m-3.5');
	});
});
