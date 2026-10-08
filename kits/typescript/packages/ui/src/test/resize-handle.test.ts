import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Probe from './resize-handle.svelte';

const panelWidth = () => screen.getByTestId('panel').style.width;

describe('ResizeHandle', () => {
	beforeEach(() => localStorage.clear());

	it('is a labelled vertical separator, focusable, with its range', () => {
		render(Probe);
		const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
		expect(handle).toHaveAttribute('aria-orientation', 'vertical');
		expect(handle).toHaveAttribute('aria-valuemin', '180');
		expect(handle).toHaveAttribute('aria-valuemax', '400');
		expect(handle).toHaveAttribute('tabindex', '0');
	});

	it('arrows nudge and persist, clamped; Home and double-click reset', async () => {
		render(Probe);
		const handle = screen.getByRole('separator');
		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		const first = Number(handle.getAttribute('aria-valuenow'));
		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(handle).toHaveAttribute('aria-valuenow', String(first + 16));
		expect(localStorage.getItem('probe-width')).toBe(String(first + 16));
		expect(panelWidth()).toBe(`${first + 16}px`);
		await fireEvent.keyDown(handle, { key: 'End' });
		expect(handle).toHaveAttribute('aria-valuenow', '400');
		await fireEvent.keyDown(handle, { key: 'Home' });
		expect(handle).not.toHaveAttribute('aria-valuenow');
		expect(localStorage.getItem('probe-width')).toBeNull();
		await fireEvent.keyDown(handle, { key: 'ArrowLeft' });
		await fireEvent.dblClick(handle);
		expect(handle).not.toHaveAttribute('aria-valuenow');
		expect(localStorage.getItem('probe-width')).toBeNull();
	});

	it('restores a stored width and ignores one outside the range', async () => {
		localStorage.setItem('probe-width', '300');
		const { unmount } = render(Probe);
		await waitFor(() =>
			expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '300')
		);
		unmount();
		localStorage.setItem('probe-width', '9999');
		render(Probe);
		expect(screen.getByRole('separator')).not.toHaveAttribute('aria-valuenow');
	});

	it('survives storage that throws', async () => {
		const set = Storage.prototype.setItem;
		Storage.prototype.setItem = () => {
			throw new Error('blocked');
		};
		try {
			render(Probe);
			const handle = screen.getByRole('separator');
			await fireEvent.keyDown(handle, { key: 'End' });
			expect(handle).toHaveAttribute('aria-valuenow', '400');
		} finally {
			Storage.prototype.setItem = set;
		}
	});
});
