import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Working from '$lib/components/working/working.svelte';
import { copyFor } from '$lib/copy';

describe('Working line', () => {
	it('opens on the persona working, not an architecture-flavoured placeholder', () => {
		render(Working, { props: {} });
		expect(screen.getByText('Assistant is working…')).toBeInTheDocument();
	});

	it('says what is happening now in the host’s one verb, with one ellipsis', () => {
		render(Working, { props: { label: 'Searching the library…' } });
		expect(screen.getByText('Searching the library…')).toBeInTheDocument();
	});

	it('keeps its words until the work changes, never swapping them on a timer', () => {
		// The operator's word for words that swap on their own: "a disco strobe".
		vi.useFakeTimers();
		try {
			render(Working, { props: { copy: copyFor('penny') } });
			expect(screen.getByText('Penny is working…')).toBeInTheDocument();
			vi.advanceTimersByTime(10_000);
			expect(screen.getByText('Penny is working…')).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});

	it('turns a glyph through its shapes at one beat, and never fades it', async () => {
		vi.useFakeTimers();
		try {
			const { container } = render(Working, { props: {} });
			const glyph = container.querySelector('.ds-lib-spinner') as HTMLElement;
			const seen = new Set<string>();
			for (let i = 0; i < 10; i += 1) {
				seen.add(glyph.textContent ?? '');
				await vi.advanceTimersByTimeAsync(120);
			}
			expect(seen.size).toBeGreaterThan(4);
			expect(getComputedStyle(glyph).animationName).toMatch(/^(none|)$/);
		} finally {
			vi.useRealTimers();
		}
	});

	it('offers Stop when the host can stop the answer', async () => {
		const onstop = vi.fn();
		render(Working, { props: { onstop } });
		await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
		expect(onstop).toHaveBeenCalledOnce();
	});

	it('offers no Stop when nothing would stop', () => {
		render(Working, { props: {} });
		expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
	});
});
