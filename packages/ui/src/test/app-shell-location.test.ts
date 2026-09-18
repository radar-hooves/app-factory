import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Harness from './app-shell-location.svelte';
import { activeNavLabel } from '$lib/components/ui/app-shell/types.js';

const nav = [
	{ label: 'Overview', href: '/overview' },
	{
		label: 'Securities',
		href: '/securities',
		children: [{ label: 'Investing', href: '/securities/investing' }]
	}
];

describe('activeNavLabel', () => {
	it('names the active item, the active child over its parent, and nothing off-nav', () => {
		expect(activeNavLabel(nav, '/overview')).toBe('Overview');
		expect(activeNavLabel(nav, '/securities')).toBe('Securities');
		expect(activeNavLabel(nav, '/securities/investing')).toBe('Investing');
		expect(activeNavLabel(nav, '/securities/investing/abc')).toBe('Investing');
		expect(activeNavLabel(nav, '/elsewhere')).toBeUndefined();
		expect(activeNavLabel(nav, undefined)).toBeUndefined();
	});
});

describe('AppShell — location row', () => {
	beforeEach(() => localStorage.clear());

	it('shows where you are, and follows navigation', async () => {
		const { rerender } = render(Harness, { currentPath: '/securities/trading' });
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent('Trading');
		await rerender({ currentPath: '/overview' });
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent('Overview');
	});

	it('renders no row on a route the nav does not list', () => {
		render(Harness, { currentPath: '/nowhere' });
		expect(screen.queryByTestId('ds-shell-location')).not.toBeInTheDocument();
	});

	it('names the settings section, on the same match the foot row lights on', async () => {
		const { rerender } = render(Harness, { currentPath: '/settings/about' });
		const settings = screen.getByRole('link', { name: 'Settings' });
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent('Settings');
		expect(settings).toHaveAttribute('aria-current', 'page');

		// A route that merely starts with the same characters is not inside it.
		await rerender({ currentPath: '/settings-archive' });
		expect(screen.queryByTestId('ds-shell-location')).not.toBeInTheDocument();
		expect(settings).not.toHaveAttribute('aria-current');

		// A nav route still names itself.
		await rerender({ currentPath: '/overview' });
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent('Overview');
	});

	it('carries the page’s registered controls, live, and withdraws them on unmount', async () => {
		const { rerender } = render(Harness, { currentPath: '/securities', withControls: true });
		const row = screen.getByTestId('ds-shell-location');
		const group = await waitFor(() => screen.getByRole('group', { name: 'Financial year' }));
		expect(row).toContainElement(group);
		expect(screen.getByTestId('probe-year')).toHaveTextContent('FY26');
		await fireEvent.click(screen.getByRole('radio', { name: 'FY25' }));
		await waitFor(() => expect(screen.getByTestId('probe-year')).toHaveTextContent('FY25'));

		await rerender({ currentPath: '/securities', withControls: false });
		await waitFor(() =>
			expect(screen.queryByRole('group', { name: 'Financial year' })).not.toBeInTheDocument()
		);
		expect(screen.getByTestId('ds-shell-location')).toHaveTextContent('Securities');
	});
});

describe('AppShell — rail resize', () => {
	beforeEach(() => localStorage.clear());

	it('nudges by keyboard, persists, and Home resets', async () => {
		render(Harness);
		const handle = screen.getByTestId('ds-rail-resize');
		expect(handle).not.toHaveAttribute('aria-valuenow');
		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		const first = Number(handle.getAttribute('aria-valuenow'));
		expect(first).toBeGreaterThan(0);
		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(Number(handle.getAttribute('aria-valuenow'))).toBe(first + 16);
		expect(localStorage.getItem('ds-shell-rail-width')).toBe(String(first + 16));
		await fireEvent.keyDown(handle, { key: 'Home' });
		expect(handle).not.toHaveAttribute('aria-valuenow');
		expect(localStorage.getItem('ds-shell-rail-width')).toBeNull();
	});

	it('reads a stored width on mount and clamps to the range', async () => {
		localStorage.setItem('ds-shell-rail-width', '300');
		render(Harness);
		await waitFor(() =>
			expect(screen.getByTestId('ds-rail-resize')).toHaveAttribute('aria-valuenow', '300')
		);
		await fireEvent.keyDown(screen.getByTestId('ds-rail-resize'), { key: 'End' });
		expect(screen.getByTestId('ds-rail-resize')).toHaveAttribute('aria-valuenow', '420');
	});

	it('has no handle while collapsed', async () => {
		const { rerender } = render(Harness);
		expect(screen.getByTestId('ds-rail-resize')).toBeInTheDocument();
		await rerender({ collapsed: true });
		expect(screen.queryByTestId('ds-rail-resize')).not.toBeInTheDocument();
	});
});
