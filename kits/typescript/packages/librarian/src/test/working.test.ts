import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Working from '$lib/components/working/working.svelte';
import { copyFor } from '$lib/copy';

describe('Working indicator', () => {
	it('opens on Milton looking, not an architecture-flavoured placeholder', () => {
		render(Working, { props: {} });
		expect(screen.getByText('Milton is looking…')).toBeInTheDocument();
	});

	it('takes a caller-supplied label once real work is identifiable', () => {
		render(Working, { props: { label: 'Milton is reading' } });
		expect(screen.getByText('Milton is reading…')).toBeInTheDocument();
	});

	it('speaks as whoever the host named, not as Milton in someone else\'s app', () => {
		// The defect this exists for: Pebblestone's Penny told the director
		// "Milton is looking" on every question she was asked.
		render(Working, { props: { copy: copyFor('penny') } });
		expect(screen.getByText('Penny is looking…')).toBeInTheDocument();
	});
});
