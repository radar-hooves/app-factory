/**
 * `SettingsPage`'s contract with app-slices' settings routes: what it reads,
 * the exact request each change and reset makes, and what a refusal leaves on
 * screen, because those calls ARE the interface `/api/settings` is written against.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { toast } from 'svelte-sonner';
import SettingsPage from '$lib/components/settings/settings-page.svelte';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

const DOCUMENT = {
	schema: {
		type: 'object',
		properties: {
			'example.enabled': { type: 'boolean', title: 'Enabled' },
			'example.limit': { type: 'integer', title: 'Limit', minimum: 1, maximum: 100 }
		}
	},
	value: { 'example.enabled': true, 'example.limit': 20 },
	defaults: { 'example.enabled': true, 'example.limit': 20 }
};

type Reply = { status: number; body: unknown };

/** A fetch answering the document to a GET and `acts` in turn to everything else. */
function serve(acts: Reply[] = [], load: Reply = { status: 200, body: DOCUMENT }) {
	const replies = [...acts];
	const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
		const { status, body } = !init?.method || init.method === 'GET' ? load : replies.shift()!;
		return Promise.resolve({
			ok: status < 400,
			status,
			json: () => Promise.resolve(structuredClone(body))
		});
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

/** The [url, method, body] of every call other than the load. */
function acts(fetchMock: ReturnType<typeof serve>) {
	return fetchMock.mock.calls
		.filter(([, init]) => init?.method && init.method !== 'GET')
		.map(([url, init]) => [url, init?.method, init?.body]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('SettingsPage', () => {
	it('reads the document from the endpoint and shows each setting grouped by domain', async () => {
		const fetchMock = serve();
		render(SettingsPage);

		const toggle = await screen.findByRole('switch', { name: 'Enabled' });
		expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/settings/');
		expect(screen.getByText('Example')).toBeInTheDocument();
		expect(toggle).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('spinbutton', { name: 'Limit' })).toHaveValue(20);
		expect(screen.queryByText('Overridden from default')).toBeNull();
	});

	it('saves the one changed setting, then offers its reset until it is back at the default', async () => {
		const fetchMock = serve([
			{ status: 200, body: { key: 'example.enabled', value: false, default: true, overridden: true } },
			{ status: 200, body: { key: 'example.enabled', value: true, default: true, overridden: false } }
		]);
		render(SettingsPage);

		await fireEvent.click(await screen.findByRole('switch', { name: 'Enabled' }));
		await screen.findByText('Overridden from default');
		expect(acts(fetchMock)).toEqual([['/api/settings/example.enabled', 'PATCH', '{"value":false}']]);

		await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		await waitFor(() => expect(screen.queryByText('Overridden from default')).toBeNull());
		expect(acts(fetchMock)[1]).toEqual(['/api/settings/example.enabled/reset', 'POST', undefined]);
		expect(screen.getByRole('switch', { name: 'Enabled' })).toHaveAttribute('aria-checked', 'true');
	});

	it('puts a refused value back and says why', async () => {
		serve([{ status: 422, body: { error: 'validation_error', message: "'example.enabled' takes a boolean" } }]);
		render(SettingsPage);

		const toggle = await screen.findByRole('switch', { name: 'Enabled' });
		await fireEvent.click(toggle);
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith('Could not save the setting', {
				description: "'example.enabled' takes a boolean"
			})
		);
		expect(toggle).toHaveAttribute('aria-checked', 'true');
	});

	it('says why the settings could not be read', async () => {
		serve([], { status: 403, body: { error: 'forbidden', message: 'Admin access required' } });
		render(SettingsPage);

		expect(await screen.findByText('Could not load settings')).toBeInTheDocument();
		expect(screen.getByText('Admin access required')).toBeInTheDocument();
	});
});
