<!--
	One answer a colleague shared from a room, read-only: the question, the
	answer and its sources (docs/design/agent-console.md). Anyone who may enter
	the room reads it; anyone else is refused as the room itself refuses them.
	It is the package's own `Conversation` over the one stored turn, with no
	handlers and no composer, so the app's own `Turn` and citations read here
	as they do in the room.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
	import { storedTurn } from '@poodle64/librarian/chat';
	import Conversation from '@poodle64/librarian/conversation';
	import type { Turn } from '@poodle64/librarian/transcript';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { api } from '$lib/api';
	import * as app from '$lib/agent/app';
	import { roomDocuments, sharedAnswer, type Room, type RoomExtensions } from '$lib/agent/rooms';

	const extensions: RoomExtensions = app;

	let room = $state<Room | null>(null);
	let turn = $state<Turn | null>(null);
	let refused = $state<'room' | 'answer' | null>(null);

	const who = $derived(room?.library ? 'Milton' : (room?.title ?? ''));
	const copy = $derived(room ? extensions.copy?.(room) : undefined);

	$effect(() => {
		const { room: id = '', conversation = '', turn: at = '' } = page.params;
		untrack(() => void read(id, conversation, Number(at)));
	});

	async function read(id: string, conversation: string, at: number) {
		room = null;
		turn = null;
		refused = null;
		const [rooms, shared] = await Promise.all([
			api.GET('/api/agent/rooms'),
			sharedAnswer(id, conversation, at).catch(() => null)
		]);
		const found = rooms.data?.find((r) => r.id === id);
		if (!found) refused = 'room';
		else if (!shared) refused = 'answer';
		else {
			room = found;
			turn = storedTurn(conversation, at, shared);
		}
	}
</script>

{#if refused === 'room'}
	<EmptyState
		title="Nothing to ask here"
		description="You have not been given access to this, or it is no longer offered."
	/>
{:else if refused === 'answer'}
	<EmptyState
		title="This answer is not shared"
		description="Whoever shared it may have stopped sharing it, or deleted the conversation."
	/>
{:else if !room || !turn}
	<LoadingState />
{:else}
	{@const r = room}
	<div class="flex h-full min-h-0 flex-1 flex-col">
		<Conversation
			turns={[turn]}
			running={false}
			name={who}
			loadDocument={r.library && !extensions.oncite ? roomDocuments(r) : undefined}
			oncite={extensions.oncite ? (citation) => extensions.oncite!(r, citation) : undefined}
			describeTool={extensions.describeTool}
			turn={extensions.Turn ? presented : undefined}
			lead={origin}
			{copy}
		/>
	</div>
{/if}

{#snippet origin()}
	{#if room}
		<p class="text-muted-foreground text-sm">
			Shared from
			<a
				href="/rooms/{room.id}"
				class="text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline"
			>
				{room.library ? `Ask Milton about ${room.title}` : `Ask ${room.title}`}
			</a>
		</p>
	{/if}
{/snippet}

{#snippet presented(props: AgentTranscriptProps)}
	{#if extensions.Turn && room}
		<extensions.Turn {...props} {room} />
	{/if}
{/snippet}
