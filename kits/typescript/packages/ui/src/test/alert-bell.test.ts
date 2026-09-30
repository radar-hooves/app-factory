/**
 * `AlertBell`'s contract with the app factory's alerts routes: what it lists
 * from, and the exact request each act makes, because those calls ARE the
 * interface `/api/alerts` is written against.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { toast } from 'svelte-sonner';
import AlertBell from '$lib/components/alerts/alert-bell.svelte';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

function alert(id: number, read = false) {
	return {
		id,
		key: `producer:${id}`,
		title: `Alert ${id}`,
		body: null,
		link: null,
		raised_at: new Date().toISOString(),
		read_at: read ? new Date().toISOString() : null
	};
}

/** A fetch whose list answers `alerts`, and whose acts answer `actStatus`. */
function serve(alerts: ReturnType<typeof alert>[], actStatus = 204) {
	const list = { alerts, total: alerts.length, unread: alerts.filter((a) => !a.read_at).length };
	const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
		Promise.resolve(
			!init?.method || init.method === 'GET'
				? { ok: true, json: () => Promise.resolve(list) }
				: { ok: actStatus < 400, status: actStatus }
		)
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

/** The [url, method] of every call other than the list. */
function acts(fetchMock: ReturnType<typeof serve>) {
	return fetchMock.mock.calls
		.filter(([, init]) => init?.method && init.method !== 'GET')
		.map(([url, init]) => [url, init?.method]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('AlertBell', () => {
	it('lists from the endpoint and renders nothing while nothing is open', async () => {
		const fetchMock = serve([]);
		render(AlertBell);

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/alerts/');
		expect(screen.queryByTestId('alert-bell')).toBeNull();
	});

	it('counts only the unread in its badge and its accessible name', async () => {
		serve([alert(1), alert(2), alert(3, true)]);
		render(AlertBell);

		const bell = await screen.findByTestId('alert-bell');
		expect(bell.getAttribute('aria-label')).toBe('Alerts, 2 unread');
		expect(screen.getByTestId('alert-bell-unread').textContent?.trim()).toBe('2');
	});

	it('marks an alert read when it is opened, against the endpoint it was given', async () => {
		const fetchMock = serve([alert(7)]);
		render(AlertBell, { endpoint: '/v2/alerts' });

		await fireEvent.click(await screen.findByTestId('alert-bell'));
		await fireEvent.click(await screen.findByText('Alert 7'));

		await waitFor(() => expect(acts(fetchMock)).toEqual([['/v2/alerts/7/read', 'POST']]));
	});

	it('dismisses an alert, and the bell goes once nothing is open', async () => {
		serve([alert(7)]);
		render(AlertBell);

		await fireEvent.click(await screen.findByTestId('alert-bell'));
		const afterDismiss = serve([]);
		await fireEvent.click(await screen.findByTestId('alert-dismiss'));

		await waitFor(() => expect(acts(afterDismiss)).toEqual([['/api/alerts/7', 'DELETE']]));
		await waitFor(() => expect(screen.queryByTestId('alert-bell')).toBeNull());
	});

	it('says so when an act fails, and keeps the alert', async () => {
		serve([alert(7)], 500);
		render(AlertBell);

		await fireEvent.click(await screen.findByTestId('alert-bell'));
		await fireEvent.click(await screen.findByTestId('alert-dismiss'));

		await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not dismiss the alert'));
		expect(screen.getByTestId('alert-bell')).toBeTruthy();
	});
});
