/**
 * The room's boundary: read once, then out of the way.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ScopeStatement from '$lib/components/scope-statement/scope-statement.svelte';

const STATEMENT =
	'Milton answers from the ADF Pay and Conditions Manual (PACMAN). He does not hold your own ' +
	'pay records, your unit’s orders, or anything about your individual case.';

describe('ScopeStatement', () => {
	it('leads with the whole statement while nothing else is on the surface', () => {
		render(ScopeStatement, { props: { statement: STATEMENT, expanded: true } });
		expect(screen.getByText(STATEMENT)).toBeInTheDocument();
		expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
	});

	it('is one line once the conversation has started', () => {
		render(ScopeStatement, { props: { statement: STATEMENT, expanded: false } });
		expect(screen.queryByText(STATEMENT)).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /what milton answers from/i })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});

	it('reopens from that line, because folded is not gone', async () => {
		render(ScopeStatement, { props: { statement: STATEMENT, expanded: false } });
		screen.getByRole('button').click();
		await Promise.resolve();
		expect(screen.getByText(STATEMENT)).toBeInTheDocument();
	});

	it("takes the host's own label", () => {
		render(ScopeStatement, {
			props: { statement: STATEMENT, expanded: false, copy: { scope: 'What this room covers' } }
		});
		expect(screen.getByRole('button', { name: /what this room covers/i })).toBeInTheDocument();
	});
});
