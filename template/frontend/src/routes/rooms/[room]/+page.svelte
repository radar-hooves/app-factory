<!--
	One room: a person's conversations with its agent, a persona or Milton,
	built from @poodle64/librarian's own `Chat` and components
	(docs/design/agent-console.md). The address names the room and the
	conversation (`?c=<id>`), so a link reopens it on any device, mid-answer
	included, and a question another page hands over (`?q=`) waits in the box.
	What differs per app arrives through `$lib/agent/app`, never an edit here.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
	import { Chat } from '@poodle64/librarian/chat';
	import { resolveCopy } from '@poodle64/librarian/copy';
	import Composer from '@poodle64/librarian/composer';
	import Conversation from '@poodle64/librarian/conversation';
	import ConversationList from '@poodle64/librarian/conversation-list';
	import FairUseNotice from '@poodle64/librarian/fair-use-notice';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import * as app from '$lib/agent/app';
	import { roomDocuments, roomTransport, type Room, type RoomExtensions } from '$lib/agent/rooms';

	const extensions: RoomExtensions = app;
	/** The kind a briefing is asked as, and read back by. */
	const BRIEFING = 'briefing';

	let room = $state<Room | null>(null);
	let chat = $state<Chat | null>(null);
	let missing = $state(false);
	let listOpen = $state(false);

	// Derived, so each follows its own value: `page.params` is a new object on
	// every navigation, a conversation named in the address included.
	const roomId = $derived(page.params.room);
	const wanted = $derived(page.url.searchParams.get('c'));
	const handed = $derived(page.url.searchParams.get('q')?.trim() || null);
	const briefing = $derived(room ? extensions.briefing?.(room) : undefined);
	const who = $derived(room?.library ? 'Milton' : (room?.title ?? ''));
	const copy = $derived(room ? extensions.copy?.(room) : undefined);
	const words = $derived(resolveCopy(copy, who));
	const scope = $derived.by(() => {
		if (!room?.library) return undefined;
		const from = `Milton answers from ${room.sources.join(', ')}.`;
		return room.not_held ? `${from} He does not hold ${room.not_held}.` : from;
	});

	// SvelteKit keeps this page across `/rooms/<id>`, so the room is read from
	// the address whenever it changes, never once: a link to another room
	// leaves this one's conversation and starts that room's.
	$effect(() => {
		const id = roomId;
		untrack(() => void enter(id));
	});

	async function enter(id: string | undefined) {
		chat?.new();
		chat = null;
		room = null;
		missing = false;
		listOpen = false;
		const { data } = await api.GET('/api/agent/rooms');
		if (roomId !== id) return;
		const found = data?.find((r) => r.id === id) ?? null;
		missing = found === null;
		if (!found) return;
		const card = extensions.briefing?.(found);
		chat = new Chat(roomTransport(found), {
			artefact: (kind) =>
				kind === BRIEFING && card
					? { title: card.title, summary: card.summary, isAnswer: true }
					: undefined
		});
		room = found;
		void chat.list();
	}

	// The address names the conversation: a link, the back button or the list
	// opens one, and no address is a new one, with a handed-over question in
	// its box, unsent. Only the address is followed here.
	$effect(() => {
		const want = wanted;
		const question = handed;
		const current = chat;
		if (!current) return;
		untrack(() => {
			if (!want) {
				current.new();
				if (question) current.draft = question;
			} else if (want !== current.conversationId) void reopen(current, want);
		});
	});

	// ...and a conversation the agent has just named goes into the address, so
	// a refresh or a copied link finds it.
	$effect(() => {
		const named = chat?.conversationId;
		if (named && named !== untrack(() => wanted)) {
			void goto(`?c=${named}`, { replaceState: true, keepFocus: true, noScroll: true });
		}
	});

	/** A link to a conversation that cannot be read (deleted, or not this
	 *  person's) says so and leaves the address, rather than sitting on it. */
	async function reopen(current: Chat, id: string) {
		if (await current.open(id)) return;
		if (page.url.searchParams.get('c') !== id) return;
		toast.info("That conversation can't be opened. It may have been deleted.");
		await goto(page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function fresh() {
		listOpen = false;
		void goto(page.url.pathname, { keepFocus: true, noScroll: true });
	}

	async function remove(id: string): Promise<boolean> {
		const removed = (await chat?.remove(id)) ?? false;
		if (removed && wanted === id) fresh();
		return removed;
	}
</script>

{#if missing}
	<EmptyState
		title="Nothing to ask here"
		description="You have not been given access to this, or it is no longer offered."
	/>
{:else if !room || !chat}
	<LoadingState />
{:else}
	{@const c = chat}
	{@const r = room}
	<!-- On a phone the composer sits above the shell's fixed report button
	     (size-11 at bottom-4), never under it. -->
	<div class="relative flex h-full min-h-0 flex-1 max-md:pb-14">
		<aside
			class="border-border bg-background absolute inset-y-0 left-0 z-10 w-72 overflow-y-auto border-r shadow-lg md:static md:shadow-none {listOpen
				? ''
				: 'max-md:hidden'}"
		>
			<ConversationList
				conversations={c.conversations}
				failed={c.listFailed}
				current={c.conversationId}
				href={(id) => `?c=${id}`}
				onopen={() => (listOpen = false)}
				onnew={fresh}
				onrename={(id, title) => c.rename(id, title)}
				ondownload={(id) => c.download(id)}
				ondelete={remove}
				name={who}
				{copy}
			/>
		</aside>
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<div class="flex items-center gap-2 border-b px-4 py-2 md:hidden">
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
					aria-expanded={listOpen}
					onclick={() => (listOpen = !listOpen)}
				>
					{words.pastQuestions}
				</button>
			</div>
			<Conversation
				turns={c.turns}
				running={c.busy}
				version={c.version}
				waiting={c.waiting}
				answering={c.answering}
				name={who}
				welcome={r.library ? `Ask Milton about ${r.title}` : r.blurb || undefined}
				examples={r.examples}
				onexample={(question) => (c.draft = question)}
				{scope}
				onregenerate={() => void c.again()}
				onsuggest={(question) => void c.ask(question)}
				onmark={r.library ? (turn, verdict) => c.mark(turn, verdict) : undefined}
				loadDocument={r.library && !extensions.oncite ? roomDocuments(r) : undefined}
				oncite={extensions.oncite ? (citation) => extensions.oncite!(r, citation) : undefined}
				describeTool={extensions.describeTool}
				turn={extensions.Turn ? presented : undefined}
				lead={extensions.Home && !c.conversationId ? home : undefined}
				{copy}
			>
				{#snippet composer()}
					<FairUseNotice quota={c.quota} supportHref={c.quota?.support_url ?? undefined} {copy} />
					<Composer
						bind:value={c.draft}
						bind:files={c.files}
						running={c.busy}
						sendWhileRunning={c.sendWhileRunning}
						name={who}
						{copy}
						onsubmit={() => void c.ask()}
						onstop={() => void c.stop()}
						onbriefing={briefing ? () => void c.ask(briefing.question, BRIEFING) : undefined}
					/>
				{/snippet}
			</Conversation>
		</div>
	</div>
{/if}

{#snippet presented(props: AgentTranscriptProps)}
	{#if extensions.Turn && room}
		<extensions.Turn {...props} {room} />
	{/if}
{/snippet}

{#snippet home()}
	{#if extensions.Home && room}
		<extensions.Home {room} />
	{/if}
{/snippet}
