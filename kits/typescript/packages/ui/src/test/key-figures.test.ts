/** KeyFigures: a page's figures as one named list, each a StatCard carrying its states. Its row and rules are measured in an engine (`?surface=figures`). */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import KeyFigures from '#lib/components/ui/key-figures/key-figures.svelte';

describe('KeyFigures', () => {
	it('lists each figure as an item of one named list, in order', () => {
		render(KeyFigures, {
			label: 'Members at a glance',
			figures: [
				{ label: 'Members', value: 3, sub: 'in this workspace' },
				{ label: 'Active', value: 2, status: 'success' },
				{ label: 'New this month', value: 0, valueTone: 'neutral' }
			]
		});
		const items = within(screen.getByRole('list', { name: 'Members at a glance' })).getAllByRole('listitem');
		expect(items.map((i) => i.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Members 3 in this workspace',
			'Active 2',
			'New this month 0'
		]);
	});

	it('marks a state with its glyph and tones a figure, and draws no icon of its own', () => {
		const { container } = render(KeyFigures, {
			figures: [
				{ label: 'Waiting', value: 1, status: 'warning' },
				{ label: 'New this month', value: 0, valueTone: 'neutral' }
			]
		});
		const [waiting, fresh] = container.querySelectorAll('[data-slot="stat-card"]');
		expect(waiting!.querySelector('[data-status="warning"]')).not.toBeNull();
		expect(fresh!.querySelector('[data-tone="neutral"]')).toHaveClass('ds-ink-neutral');
		expect(container.querySelectorAll('[data-slot="stat-card"] .ds-icon-accent')).toHaveLength(0);
	});
});
