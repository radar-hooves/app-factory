/**
 * The updater's contract with the Tauri plugin mocked: what a check reports to
 * the host process, that a launch check is quiet when it fails, and that the
 * schedule does not re-check while an update is on offer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { check, invoke, toast } = vi.hoisted(() => ({
	check: vi.fn(),
	invoke: vi.fn(() => Promise.resolve()),
	toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), loading: vi.fn(), success: vi.fn() })
}));
vi.mock('@tauri-apps/plugin-updater', () => ({ check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('svelte-sonner', () => ({ toast }));

import { checkForUpdate, getUpdaterState, startUpdateChecks, UPDATE_RECHECK_MS } from '../lib/updater.svelte';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('checkForUpdate', () => {
	it('offers an update and reports it to the host process', async () => {
		check.mockResolvedValue({ version: '2026.11.9' });
		await checkForUpdate();
		expect(getUpdaterState().state).toBe('available');
		expect(invoke).toHaveBeenCalledWith('plugin:telemetry|report_update_check', {
			available: true,
			failed: false
		});
		expect(toast.info).toHaveBeenCalledOnce();
	});

	it('reports up to date', async () => {
		check.mockResolvedValue(null);
		await checkForUpdate();
		expect(getUpdaterState().state).toBe('up-to-date');
		expect(toast.info).not.toHaveBeenCalled();
	});

	it('reports a failure without its text, and raises no toast when quiet', async () => {
		check.mockRejectedValue(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await checkForUpdate({ quiet: true });
		expect(getUpdaterState().state).toBe('error');
		expect(invoke).toHaveBeenCalledWith('plugin:telemetry|report_update_check', {
			available: false,
			failed: true
		});
		expect(toast.error).not.toHaveBeenCalled();
	});
});

describe('startUpdateChecks', () => {
	it('checks at launch, again each interval, and not while an update is on offer', async () => {
		vi.useFakeTimers();
		check.mockResolvedValue(null);
		const stop = startUpdateChecks();
		expect(check).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(UPDATE_RECHECK_MS);
		expect(check).toHaveBeenCalledTimes(2);
		check.mockResolvedValue({ version: '2026.11.9' });
		await vi.advanceTimersByTimeAsync(UPDATE_RECHECK_MS);
		expect(check).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(UPDATE_RECHECK_MS);
		expect(check).toHaveBeenCalledTimes(3);
		stop();
	});
});
