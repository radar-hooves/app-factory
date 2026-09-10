/**
 * AppIdentity's initials rule (operator ruling, 07/09/2026): never text in the
 * bar, and a bare handle's initials must not read as more than they are — a
 * handle with no separator has no second letter to honestly pair with the
 * first. `initials-of` a display name is unaffected; only the no-display-name
 * fallback changes.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Shield from '@lucide/svelte/icons/shield';
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

/**
 * `links` — the app-supplied destinations group (cadmus: an Admin route and a
 * support link that had nowhere to go but AppShell's `actions` slot).
 *
 * The claims worth holding: nothing renders when the prop is absent or empty,
 * every supplied link renders in order and calls back, and Sign out is still
 * the last item in the menu whatever is added above it.
 */
function menuItemLabels(): string[] {
	return screen
		.getAllByRole('menuitem')
		.map((el) => el.textContent?.trim() ?? '')
		.filter(Boolean);
}

async function openMenu() {
	await fireEvent.click(screen.getByRole('button', { name: 'Account' }));
	await waitFor(() => expect(screen.getByText('Sign out')).toBeInTheDocument());
}

describe('AppIdentity — app-supplied links', () => {
	it('renders no extra group and no extra separator when links is absent', async () => {
		const { container } = render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				onSignOut: () => {}
			}
		});

		await openMenu();

		expect(menuItemLabels()).toEqual(['Switch theme', 'Account settings', 'Sign out']);
		expect(container.ownerDocument.querySelectorAll('[data-slot="dropdown-menu-group"]')).toHaveLength(
			0
		);
		expect(
			container.ownerDocument.querySelectorAll('[data-slot="dropdown-menu-separator"]')
		).toHaveLength(2);
	});

	it('renders nothing for an empty links array', async () => {
		const { container } = render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				onSignOut: () => {},
				links: []
			}
		});

		await openMenu();

		expect(menuItemLabels()).toEqual(['Switch theme', 'Account settings', 'Sign out']);
		expect(container.ownerDocument.querySelectorAll('[data-slot="dropdown-menu-group"]')).toHaveLength(
			0
		);
		expect(
			container.ownerDocument.querySelectorAll('[data-slot="dropdown-menu-separator"]')
		).toHaveLength(2);
	});

	it('renders one link above the theme toggle, and calls back on select', async () => {
		let called = false;
		const { container } = render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				onSignOut: () => {},
				links: [
					{
						label: 'Admin',
						onSelect: () => {
							called = true;
						}
					}
				]
			}
		});

		await openMenu();

		expect(menuItemLabels()).toEqual(['Admin', 'Switch theme', 'Account settings', 'Sign out']);
		expect(container.ownerDocument.querySelectorAll('[data-slot="dropdown-menu-group"]')).toHaveLength(
			1
		);
		expect(
			container.ownerDocument.querySelectorAll('[data-slot="dropdown-menu-separator"]')
		).toHaveLength(3);

		await fireEvent.click(screen.getByText('Admin'));
		expect(called).toBe(true);
	});

	it('renders several links in order, after Members and before Sign out', async () => {
		const picked: string[] = [];
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				workspace: 'Household',
				onManageMembers: () => picked.push('Members'),
				onSignOut: () => picked.push('Sign out'),
				links: [
					{ label: 'Admin', onSelect: () => picked.push('Admin') },
					{ label: 'Support Milton', onSelect: () => picked.push('Support Milton') }
				]
			}
		});

		await openMenu();

		const labels = menuItemLabels();
		expect(labels).toEqual([
			'Members',
			'Admin',
			'Support Milton',
			'Switch theme',
			'Account settings',
			'Sign out'
		]);
		expect(labels.at(-1)).toBe('Sign out');

		await fireEvent.click(screen.getByText('Support Milton'));
		expect(picked).toEqual(['Support Milton']);
	});

	it('renders a label-only row beside an iconed one without shifting its label', async () => {
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				onSignOut: () => {},
				links: [
					{ label: 'Admin', icon: Shield, onSelect: () => {} },
					{ label: 'Support Milton', onSelect: () => {} }
				]
			}
		});

		await openMenu();

		const [admin, support] = screen
			.getAllByRole('menuitem')
			.filter((el) => ['Admin', 'Support Milton'].includes(el.textContent?.trim() ?? ''));

		// The iconed row draws an svg; the label-only row draws an aria-hidden
		// spacer of the same size, so the two labels start at the same offset.
		expect(admin.querySelector('svg')).not.toBeNull();
		expect(support.querySelector('svg')).toBeNull();
		expect(support.querySelector('[aria-hidden="true"]')).not.toBeNull();
	});

	it('keeps Sign out last even with a long links list', async () => {
		render(AppIdentity, {
			props: {
				user: { username: 'jdoe', display_name: null, email: null },
				onSignOut: () => {},
				links: [
					{ label: 'Admin', onSelect: () => {} },
					{ label: 'Support Milton', onSelect: () => {} },
					{ label: 'Status', onSelect: () => {} },
					{ label: 'Docs', onSelect: () => {} }
				]
			}
		});

		await openMenu();

		expect(menuItemLabels().at(-1)).toBe('Sign out');
	});
});
