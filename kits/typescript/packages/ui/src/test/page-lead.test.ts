/** PageLead: the answer is a second-level heading (the rail owns the h1), and optional parts stay out when absent. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PageLead from '#lib/components/ui/page-lead/page-lead.svelte';

describe('PageLead', () => {
	it('renders the lead as an h2 and the eyebrow and subtitle beside it', () => {
		render(PageLead, { lead: 'Nothing new since 24/10', eyebrow: 'Today', subtitle: 'Checked at 9am' });
		expect(screen.getByRole('heading', { level: 2, name: 'Nothing new since 24/10' })).toHaveAttribute('data-answer');
		expect(screen.getByText('Today')).toBeInTheDocument();
		expect(screen.getByText('Checked at 9am')).toBeInTheDocument();
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
	});

	it('draws only the lead when nothing else is given', () => {
		const { container } = render(PageLead, { lead: 'All clear' });
		expect(container.querySelector('[data-slot="page-lead"]')!.children).toHaveLength(1);
	});
});
