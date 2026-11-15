/**
 * A desktop app's self-update, over `tauri-plugin-updater`: check the app's own
 * signed GitHub releases, download, install, relaunch. Toasts (svelte-sonner)
 * tell the person what is on offer; `getUpdaterState()` is what an app's
 * Settings pane reads to show the check. Tauri-only: import it from a desktop
 * app's layout, never from a web app.
 */
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'svelte-sonner';

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'up-to-date' | 'error';

export interface UpdaterState {
	state: UpdateState;
	update: Update | null;
	updateVersion: string | null;
	error: string | null;
}

const updaterState = $state<UpdaterState>({
	state: 'idle',
	update: null,
	updateVersion: null,
	error: null
});

/** How often a running app checks again: it stays up for weeks between launches. */
export const UPDATE_RECHECK_MS = 6 * 60 * 60 * 1000;

/** The updater's state, reactive. */
export function getUpdaterState(): UpdaterState {
	return updaterState;
}

/** Translate a raw update error into a message a person can act on. */
function describeUpdateError(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err);
	const lower = raw.toLowerCase();
	if (lower.includes('permission') || lower.includes('privilege') || lower.includes('cancel')) {
		return 'Update requires administrator access. Try again and enter your password when prompted.';
	}
	if (lower.includes('network') || lower.includes('connect') || lower.includes('timed out') || lower.includes('fetch')) {
		return 'Download interrupted. Check your internet connection and try again.';
	}
	if (lower.includes('signature') || lower.includes('verify')) {
		return 'Update signature verification failed. The download may be corrupted. Try again.';
	}
	return `Update failed: ${raw}`;
}

/** Download and install the update on offer, then relaunch. */
export async function downloadAndInstall(): Promise<void> {
	if (!updaterState.update) return;
	const toastId = toast.loading('Downloading update...');
	try {
		updaterState.state = 'downloading';
		let downloaded = 0;
		let total = 0;
		await updaterState.update.downloadAndInstall((event) => {
			if (event.event === 'Started') {
				total = event.data.contentLength ?? 0;
			} else if (event.event === 'Progress') {
				downloaded += event.data.chunkLength;
				if (total > 0) {
					const pct = Math.min(99, Math.round((downloaded / total) * 100));
					toast.loading(`Downloading update... ${pct}%`, { id: toastId });
				}
			} else if (event.event === 'Finished') {
				toast.success('Update installed. Restarting...', { id: toastId });
			}
		});
		await relaunch();
	} catch (err) {
		const message = describeUpdateError(err);
		updaterState.state = 'error';
		updaterState.error = message;
		toast.error('Update failed', {
			id: toastId,
			description: message,
			action: { label: 'Retry', onClick: () => void checkForUpdate() }
		});
	}
}

/**
 * Check for an update. A found update raises a toast that stays until acted
 * on; a failure raises one unless `quiet`. The outcome is reported to the host
 * process (`tauri-plugin-telemetry`), the one thing allowed to emit telemetry.
 */
export async function checkForUpdate({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
	updaterState.state = 'checking';
	updaterState.error = null;
	updaterState.update = null;
	updaterState.updateVersion = null;
	try {
		const update = await check();
		if (update) {
			updaterState.state = 'available';
			updaterState.update = update;
			updaterState.updateVersion = update.version;
			void invoke('plugin:telemetry|report_update_check', { available: true, version: update.version, failed: false });
			toast.info(`Update available: v${update.version}`, {
				description: `Version ${update.version} is ready to install`,
				duration: Infinity,
				action: { label: 'Update Now', onClick: () => void downloadAndInstall() },
				cancel: { label: 'Later', onClick: () => {} }
			});
		} else {
			updaterState.state = 'up-to-date';
			void invoke('plugin:telemetry|report_update_check', { available: false, version: null, failed: false });
		}
	} catch (err) {
		updaterState.state = 'error';
		updaterState.error = err instanceof Error ? err.message : 'Failed to check for updates';
		console.error('Update check failed:', err);
		void invoke('plugin:telemetry|report_update_check', { available: false, version: null, failed: true });
		if (quiet) return;
		toast.error('Failed to check for updates', { description: updaterState.error });
	}
}

/**
 * Check now, then again every {@link UPDATE_RECHECK_MS} while the app runs, so a
 * release published after launch is still offered. A re-check is skipped while
 * an update is on offer or a check is in flight, and fails quietly: an offline
 * Mac raises no error toast. Returns the function that stops the schedule.
 */
export function startUpdateChecks(): () => void {
	void checkForUpdate({ quiet: true });
	const timer = setInterval(() => {
		if (!['checking', 'available', 'downloading'].includes(updaterState.state)) {
			void checkForUpdate({ quiet: true });
		}
	}, UPDATE_RECHECK_MS);
	return () => clearInterval(timer);
}
