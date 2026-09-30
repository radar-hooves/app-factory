/**
 * A page opens the conversation its address names from an effect. The effect
 * must follow the address and nothing of the controller's own, or opening a
 * conversation re-runs it: in the lab that silently left the list unread and
 * the allowance unshown, with no error anywhere.
 */
import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { Chat, type RoomTransport } from '$lib/chat.svelte';

const READ = {
	id: 'a',
	title: 'Receipt',
	last_activity_at: '2026-09-30T02:00:00Z',
	turns: [{ question: 'What is the total?', answer: '$4.95' }]
};

function transport(): RoomTransport {
	return {
		ask: async function* () {},
		read: vi.fn(async (id: string) => ({ ...READ, id })),
		stop: vi.fn(async () => undefined),
		quota: vi.fn(async () => ({
			limit: 40,
			remaining: 40,
			exempt: false,
			reached: false,
			resets_at: '2026-10-01T00:00:00+10:00'
		})),
		list: vi.fn(async () => []),
		rename: vi.fn(async () => undefined),
		remove: vi.fn(async () => undefined),
		download: vi.fn(async () => ({ name: 'x.md', body: new Blob() }))
	};
}

describe('Chat from an effect', () => {
	it('opens what the address names, and the effect follows only the address', async () => {
		const chat = new Chat(transport());
		let address = $state<string | null>('a');
		let runs = 0;
		const stop = $effect.root(() => {
			$effect(() => {
				runs += 1;
				if (address) void chat.open(address);
				else chat.new();
			});
		});
		flushSync();
		await vi.waitFor(() => expect(chat.turns).toHaveLength(1));
		await vi.waitFor(() => expect(chat.quota).not.toBeNull());
		flushSync();
		expect(runs).toBe(1);

		address = 'b';
		flushSync();
		await vi.waitFor(() => expect(chat.conversationId).toBe('b'));
		address = null;
		flushSync();
		expect(chat.conversationId).toBeNull();
		expect(runs).toBe(3);
		stop();
	});
});
