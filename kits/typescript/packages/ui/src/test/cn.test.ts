/** cn: the type scale's keys merge as sizes, so a colour beside one survives. */
import { describe, it, expect } from 'vitest';
import { cn } from '#lib/utils.js';

describe('cn', () => {
	it('keeps a colour beside a type-scale size, and lets the later size win', () => {
		expect(cn('text-foreground text-body font-semibold', 'whitespace-nowrap')).toBe(
			'text-foreground text-body font-semibold whitespace-nowrap'
		);
		expect(cn('text-sm', 'text-section')).toBe('text-section');
		expect(cn('text-display', 'text-muted-foreground')).toBe('text-display text-muted-foreground');
	});
});
