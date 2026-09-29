import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AlertBell from './alert-bell.svelte';

const GET = vi.fn();
const POST = vi.fn();
const DELETE = vi.fn();

vi.mock('$lib/api', () => ({
	api: {
		GET: (...args: unknown[]) => GET(...args),
		POST: (...args: unknown[]) => POST(...args),
		DELETE: (...args: unknown[]) => DELETE(...args)
	},
	toastApiError: vi.fn()
}));

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

function serve(...alerts: ReturnType<typeof alert>[]) {
	GET.mockResolvedValue({
		data: { alerts, total: alerts.length, unread: alerts.filter((a) => !a.read_at).length }
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	POST.mockResolvedValue({ error: undefined });
	DELETE.mockResolvedValue({ error: undefined });
});

describe('alert bell', () => {
	it('renders nothing while nothing is open', async () => {
		serve();
		render(AlertBell);

		await waitFor(() => expect(GET).toHaveBeenCalledWith('/api/alerts/'));
		expect(screen.queryByTestId('alert-bell')).toBeNull();
	});

	it('counts only the unread in its badge', async () => {
		serve(alert(1), alert(2), alert(3, true));
		render(AlertBell);

		const bell = await screen.findByTestId('alert-bell');
		expect(bell.getAttribute('aria-label')).toBe('Alerts, 2 unread');
		expect(screen.getByTestId('alert-bell-unread').textContent?.trim()).toBe('2');
	});

	it('marks an alert read when it is opened', async () => {
		serve(alert(7));
		render(AlertBell);

		await fireEvent.click(await screen.findByTestId('alert-bell'));
		await fireEvent.click(await screen.findByText('Alert 7'));

		expect(POST).toHaveBeenCalledWith('/api/alerts/{alert_id}/read', {
			params: { path: { alert_id: 7 } }
		});
	});

	it('dismisses an alert, and the bell goes once nothing is open', async () => {
		serve(alert(7));
		render(AlertBell);

		await fireEvent.click(await screen.findByTestId('alert-bell'));
		serve();
		await fireEvent.click(await screen.findByTestId('alert-dismiss'));

		expect(DELETE).toHaveBeenCalledWith('/api/alerts/{alert_id}', {
			params: { path: { alert_id: 7 } }
		});
		await waitFor(() => expect(screen.queryByTestId('alert-bell')).toBeNull());
	});
});
