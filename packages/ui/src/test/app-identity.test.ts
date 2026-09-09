/**
 * AppIdentity's initials rule (operator ruling, 07/09/2026): never text in the
 * bar, and a bare handle's initials must not read as more than they are — a
 * handle with no separator has no second letter to honestly pair with the
 * first. `initials-of` a display name is unaffected; only the no-display-name
 * fallback changes.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { AppIdentity } from '$lib/components/ui/app-identity';

describe('AppIdentity — handle initials with no display name', () => {
	it('takes one letter from a bare, unbroken handle', () => {
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				onSignOut: () => {}
			}
		});

		expect(screen.getByRole('button', { name: 'Account' })).toHaveTextContent('J');
		expect(screen.queryByText('jdoe')).not.toBeInTheDocument();
	});

	it('takes one letter per segment from a dotted handle', () => {
		render(AppIdentity, {
			props: {
				user: { username: 'jordan.rivers', display_name: null, email: null },
				onSignOut: () => {}
			}
		});

		expect(screen.getByRole('button', { name: 'Account' })).toHaveTextContent('JR');
	});

	it('takes one letter per segment from a hyphenated handle', () => {
		render(AppIdentity, {
			props: {
				user: { username: 'mary-jane', display_name: null, email: null },
				onSignOut: () => {}
			}
		});

		expect(screen.getByRole('button', { name: 'Account' })).toHaveTextContent('MJ');
	});

	it('still slices a single-word display name to two letters', () => {
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: 'Operator', email: null },
				onSignOut: () => {}
			}
		});

		expect(screen.getByRole('button', { name: 'Account' })).toHaveTextContent('OP');
	});
});

describe('AppIdentity — Members reachability with no switcher', () => {
	it('renders no Members item when onManageMembers is not passed', async () => {
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				workspace: 'Household',
				onSignOut: () => {}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Account' }));
		await waitFor(() => expect(screen.getByText('Household')).toBeInTheDocument());

		expect(screen.queryByText('Members')).not.toBeInTheDocument();
	});

	it('renders a Members item that calls back, once a workspace is set', async () => {
		let called = false;
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				workspace: 'Household',
				onManageMembers: () => {
					called = true;
				},
				onSignOut: () => {}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Account' }));
		const item = await waitFor(() => screen.getByText('Members'));
		await fireEvent.click(item);

		expect(called).toBe(true);
	});
});
