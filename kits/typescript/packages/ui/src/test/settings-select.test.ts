import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Harness from './settings-select.svelte';

describe('SettingsShell — state-driven', () => {
	it('renders buttons, not links, and marks only the selected one', () => {
		render(Harness);
		expect(screen.queryAllByRole('link')).toHaveLength(0);
		const nav = screen.getByRole('navigation', { name: 'Settings sections' });
		const current = [...nav.querySelectorAll('[aria-current]')];
		expect(current.map((b) => b.textContent?.trim())).toEqual(['Library']);
	});

	it('calls onselect with the id and moves the mark', async () => {
		const onpick = vi.fn();
		render(Harness, { props: { onpick } });
		await fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
		expect(onpick).toHaveBeenCalledWith('audio');
		expect(screen.getByRole('button', { name: 'Audio' })).toHaveAttribute('aria-current', 'true');
		expect(screen.getByRole('button', { name: 'Library' })).not.toHaveAttribute('aria-current');
	});
});

describe('SettingsRow', () => {
	it('names the control with its label and shows the description', () => {
		render(Harness);
		expect(screen.getByLabelText('Rescan')).toBe(document.getElementById('rescan'));
		expect(screen.getByText('On start.')).toBeInTheDocument();
	});

	it('is a slotted row with a rule under it, flush with the panel edge', () => {
		render(Harness);
		const rows = [...document.querySelectorAll('[data-slot="settings-row"]')];
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.className).toContain('border-b');
			expect(row.className).not.toContain('px-4');
		}
	});

	it('lets a wide control shrink or wrap inside the card instead of overflowing it', () => {
		render(Harness);
		const cell = document.getElementById('rescan')!.parentElement!;
		expect(cell.className).toContain('max-w-full');
		expect(cell.className).toContain('min-w-0');
		expect(cell.className).toContain('flex-wrap');
	});
});
