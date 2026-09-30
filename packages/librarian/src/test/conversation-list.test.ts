/**
 * A person's past conversations: newest first, each one reopens, each can be
 * renamed, downloaded or deleted, and a delete asks first.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ConversationList from '$lib/components/conversation-list/conversation-list.svelte';
import type { ConversationSummary } from '$lib/chat.svelte';

const LIST: ConversationSummary[] = [
	{ id: 'a', title: 'Leave on posting', last_activity_at: '2026-09-28T01:00:00Z' },
	{
		id: 'b',
		title: 'Field allowance',
		last_activity_at: '2026-09-30T01:00:00Z',
		answering_since: '2026-09-30T01:00:00Z'
	},
	{ id: 'c', title: 'Recreation leave', last_activity_at: '2026-09-29T01:00:00Z' }
];

function list(props: Record<string, unknown> = {}) {
	return render(ConversationList, {
		props: { conversations: LIST, onnew: vi.fn(), ...props }
	});
}

const rows = () =>
	screen.getAllByRole('listitem').map((row) => within(row).getAllByRole('button')[0].textContent);

describe('ConversationList', () => {
	it('lists newest first and reopens the one chosen', async () => {
		const onopen = vi.fn();
		list({ onopen, current: 'c' });
		expect(rows().map((t) => t?.trim())).toEqual([
			expect.stringContaining('Field allowance'),
			expect.stringContaining('Recreation leave'),
			expect.stringContaining('Leave on posting')
		]);
		expect(screen.getByRole('button', { name: /Recreation leave/ })).toHaveAttribute(
			'aria-current',
			'true'
		);
		await fireEvent.click(screen.getByRole('button', { name: /Leave on posting/ }));
		expect(onopen).toHaveBeenCalledWith('a');
	});

	it('makes each row a link to its own address where the page keeps one', () => {
		list({ href: (id: string) => `/rooms/pacman?c=${id}`, current: 'a' });
		const link = screen.getByRole('link', { name: /Leave on posting/ });
		expect(link).toHaveAttribute('href', '/rooms/pacman?c=a');
		expect(link).toHaveAttribute('aria-current', 'page');
	});

	it('marks a conversation still being answered', () => {
		list({ name: 'penny' });
		const row = screen.getByRole('button', { name: /Field allowance/ });
		expect(within(row).getByText('Penny is still answering')).toBeInTheDocument();
	});

	it('starts a new one', async () => {
		const onnew = vi.fn();
		list({ onnew });
		await fireEvent.click(screen.getByRole('button', { name: 'New question' }));
		expect(onnew).toHaveBeenCalledOnce();
	});

	it('offers no acts it was not given', () => {
		list();
		expect(screen.queryByRole('button', { name: /^More/ })).not.toBeInTheDocument();
	});

	it('renames in place', async () => {
		const onrename = vi.fn(async () => true);
		list({ onrename });
		await fireEvent.click(screen.getByRole('button', { name: 'More: Leave on posting' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		const field = screen.getByRole('textbox', { name: 'Rename' });
		expect(field).toHaveValue('Leave on posting');
		await fireEvent.input(field, { target: { value: 'Leave when I post' } });
		await fireEvent.submit(field.closest('form')!);
		expect(onrename).toHaveBeenCalledWith('a', 'Leave when I post');
		await vi.waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
	});

	it('says so when a rename fails, and leaves the box open', async () => {
		const onrename = vi.fn(async () => false);
		list({ onrename });
		await fireEvent.click(screen.getByRole('button', { name: 'More: Leave on posting' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		await fireEvent.submit(screen.getByRole('textbox').closest('form')!);
		expect(await screen.findByText("That conversation couldn't be renamed.")).toBeInTheDocument();
		expect(screen.getByRole('textbox')).toBeInTheDocument();
	});

	it('asks before it deletes', async () => {
		const ondelete = vi.fn(async () => true);
		list({ ondelete });
		await fireEvent.click(screen.getByRole('button', { name: 'More: Recreation leave' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(ondelete).not.toHaveBeenCalled();
		const ask = screen.getByRole('group', { name: 'Delete' });
		expect(ask).toHaveTextContent('Delete this conversation? It goes from every device.');

		await fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
		expect(ondelete).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await fireEvent.click(within(screen.getByRole('group')).getByRole('button', { name: 'Delete' }));
		expect(ondelete).toHaveBeenCalledWith('c');
	});

	it('downloads, and says so when it cannot', async () => {
		const ondownload = vi.fn(async () => false);
		list({ ondownload });
		await fireEvent.click(screen.getByRole('button', { name: 'More: Field allowance' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Download' }));
		expect(ondownload).toHaveBeenCalledWith('b');
		expect(
			await screen.findByText("That conversation couldn't be downloaded.")
		).toBeInTheDocument();
	});

	it('says while it reads, when it could not, and when there is nothing yet', async () => {
		const view = list({ conversations: null });
		expect(screen.getByText('Reading your past questions…')).toBeInTheDocument();
		await view.rerender({ conversations: null, failed: true, onnew: vi.fn() });
		expect(screen.getByText("Your past questions couldn't be read just now.")).toBeInTheDocument();
		await view.rerender({ conversations: [], failed: false, onnew: vi.fn() });
		expect(screen.getByText('No past questions yet.')).toBeInTheDocument();
	});
});
