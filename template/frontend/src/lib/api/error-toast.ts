/**
 * The toast idiom every action-level API failure takes:
 * `toast.error(info.title, { description: info.description })`. Split out of
 * error.ts so that file stays free of the svelte-sonner import — the other
 * shape (`describeApiError`, a flattened string) needs no toast library.
 */
import { toast } from 'svelte-sonner';

import { extractApiError } from './error';

export function toastApiError(
	error: unknown,
	fallbackTitle?: string,
	fallbackDescription?: string
): void {
	const info = extractApiError(error, fallbackTitle, fallbackDescription);
	toast.error(info.title, { description: info.description });
}
