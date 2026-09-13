import { describe, expect, it, vi } from 'vitest';

const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: errorToast } }));

import { toastApiError } from './error-toast';

describe('toastApiError', () => {
	it('puts extractApiError straight into toast.error', () => {
		toastApiError({ detail: 'Row is locked' }, 'Failed to save');

		expect(errorToast).toHaveBeenCalledWith('Failed to save', { description: 'Row is locked' });
	});
});
