import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Working from '$lib/components/working/working.svelte';

describe('Working indicator', () => {
	it('opens on Milton looking, not an architecture-flavoured placeholder', () => {
		render(Working, { props: {} });
		expect(screen.getByText('Milton is looking…')).toBeInTheDocument();
	});

	it('takes a caller-supplied label once real work is identifiable', () => {
		render(Working, { props: { label: 'Milton is reading' } });
		expect(screen.getByText('Milton is reading…')).toBeInTheDocument();
	});
});
