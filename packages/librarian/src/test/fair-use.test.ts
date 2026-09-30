/**
 * Today's allowance: a quiet count while there are questions left, a plain
 * notice once there are none, and nothing at all for anyone it does not count.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FairUseNotice from '$lib/components/fair-use-notice/fair-use-notice.svelte';
import type { Quota } from '$lib/chat.svelte';

/** Midnight tomorrow in the reader's own zone, which is where it is read. */
function midnight(): string {
	const at = new Date();
	at.setHours(24, 0, 0, 0);
	return at.toISOString();
}

const LEFT: Quota = { limit: 40, remaining: 12, exempt: false, reached: false, resets_at: midnight() };

describe('FairUseNotice', () => {
	it('counts what is left quietly', () => {
		render(FairUseNotice, { props: { quota: LEFT } });
		expect(
			screen.getByText('12 of 40 questions left today. Resets at midnight.')
		).toBeInTheDocument();
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
	});

	it('says plainly when there are none, and where to ask about it', () => {
		const spent = { ...LEFT, remaining: 0, reached: true, support_url: '/support' };
		render(FairUseNotice, { props: { quota: spent } });
		const notice = screen.getByRole('status');
		expect(notice).toHaveTextContent(
			"You've reached today's fair-use limit of 40 questions. It resets at midnight."
		);
		expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support');
	});

	it('names the hour when it comes back at some other time', () => {
		const at = new Date();
		at.setHours(14, 0, 0, 0);
		render(FairUseNotice, { props: { quota: { ...LEFT, resets_at: at.toISOString() } } });
		const hour = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		expect(screen.getByText(`12 of 40 questions left today. Resets at ${hour}.`)).toBeInTheDocument();
	});

	it('shows nothing to someone exempt, nothing where there is no limit, and nothing unread', async () => {
		const { container, rerender } = render(FairUseNotice, {
			props: { quota: { ...LEFT, exempt: true } }
		});
		const empty = () => expect(container.children).toHaveLength(0);
		empty();
		await rerender({ quota: { ...LEFT, limit: 0 } });
		empty();
		await rerender({ quota: null });
		empty();
	});
});
