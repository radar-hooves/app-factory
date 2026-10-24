<!--
	One persona: a person's conversations with it, built from
	@poodle64/librarian's own `Chat` and components
	(app-factory docs/design/agent-console.md). Past questions are a column
	beside the conversation from 1024px, in the page and not the rail, folded to
	its edge or open as the reader left it, New question at its head and Clear
	all at its foot; narrower, the bar's own action opens them in a sheet
	(operator, 24/10/2026). The address names the persona,
	the conversation (`?c=<id>`) and the collection a question is narrowed to
	(`?collection=<name>`), or the subject (`?group=<name>`, every collection
	under it), so a link reopens or narrows it on any device,
	mid-answer included. A question another page hands over waits in the box
	(`?q=`), or is asked on arrival, with its files, when it says so in
	navigation state (`handOff` from `$lib/agent/chat`, which a Home page's
	`AskHome` calls), which a pasted link cannot carry. That question never waits on the collection list: it goes as
	soon as the persona is known, narrowed by the name the address gives.
	A briefing is asked once, from a Home page, so this composer offers no
	control for one (operator, 24/10/2026); one handed over still reads as its
	card. What differs per app arrives through `$lib/agent/app`, never an edit here.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
	import { Chat } from '@poodle64/librarian/chat';
	import { resolveCopy } from '@poodle64/librarian/copy';
	import Conversation from '@poodle64/librarian/conversation';
	import ConversationList from '@poodle64/librarian/conversation-list';
	import FairUseNotice from '@poodle64/librarian/fair-use-notice';
	import { defaultVisuals } from '@poodle64/librarian/visuals';
	import * as AlertDialog from '@poodle64/ui/alert-dialog';
	import { ShellActions } from '@poodle64/ui/app-shell';
	import { Button } from '@poodle64/ui/button';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import * as Sheet from '@poodle64/ui/sheet';
	import { toast } from 'svelte-sonner';
	import * as app from '$lib/agent/app';
	import AskBox from '$lib/agent/ask-box.svelte';
	import {
		BRIEFING,
		chatTransport,
		collectionsOf,
		documentsTo,
		personaDocuments,
		personasOf,
		type Collection,
		type ChatExtensions,
		type Persona
	} from '$lib/agent/chat';

	const extensions: ChatExtensions = app;
	const visuals = { ...defaultVisuals, ...extensions.visuals };

	// Currency and rate are this app's own, declared in $lib/agent/app.ts;
	// without one, the plain USD figure, which is always correct, merely
	// unconverted.
	const formatCost = extensions.formatCost ?? ((usd: number) => `about US$${usd.toFixed(2)}`);

	let persona = $state<Persona | null>(null);
	let chat = $state<Chat | null>(null);
	let collections = $state<Collection[]>([]);
	// False until the library's list has arrived (or the persona reads none).
	let listed = $state(false);
	let missing = $state(false);
	let listOpen = $state(false);
	let clearing = $state(false);

	// Past questions are a column beside the conversation from `WIDE`, folded
	// to its edge or open as the reader last left it; narrower, a sheet the
	// bar's own action opens (the operator, 24/10/2026).
	const WIDE = '(min-width: 1024px)';
	const FOLDED = 'ds-chat-past-folded';
	let wide = $state(false);
	let folded = $state(false);
	$effect(() => {
		const query = window.matchMedia?.(WIDE);
		if (!query) return;
		wide = query.matches;
		const follow = (event: MediaQueryListEvent) => (wide = event.matches);
		query.addEventListener('change', follow);
		return () => query.removeEventListener('change', follow);
	});
	$effect(() => {
		try {
			folded = localStorage.getItem(FOLDED) === '1';
		} catch {
			// No storage: the column opens.
		}
	});
	function fold(next: boolean) {
		folded = next;
		try {
			localStorage.setItem(FOLDED, next ? '1' : '0');
		} catch {
			// Remembered for this visit only.
		}
	}

	// Derived, so each follows its own value: `page.params` is a new object on
	// every navigation, a conversation named in the address included.
	const personaId = $derived(page.params.persona);
	const wanted = $derived(page.url.searchParams.get('c'));
	const handed = $derived(page.url.searchParams.get('q')?.trim() || null);
	const asked = $derived(typeof page.state.ask === 'string' ? page.state.ask.trim() || null : null);
	// Once the library has listed them, the address names a collection it did
	// not list for this person as no collection: the question then goes across
	// every one they may read. Before that the name stands as given (the library
	// refuses one the person cannot read), so a question never waits on the list.
	const collection = $derived.by(() => {
		const named = page.url.searchParams.get('collection');
		if (!named) return undefined;
		return !listed || collections.some((c) => c.name === named) ? named : undefined;
	});
	// The same for a subject: one no collection listed for this person is under
	// is no subject.
	const group = $derived.by(() => {
		const named = page.url.searchParams.get('group');
		if (!named || collection) return undefined;
		return !listed || collections.some((c) => c.subject?.name === named) ? named : undefined;
	});
	const choices = $derived<Collection[]>(
		!listed && collection ? [{ name: collection, title: '', description: '' }] : collections
	);
	const who = $derived(persona?.name ?? '');
	const copy = $derived(persona ? extensions.copy?.(persona) : undefined);
	const words = $derived(resolveCopy(copy, who));
	const scope = $derived.by(() => {
		if (!persona) return undefined;
		// An app that says it elsewhere (its Home, its About) says it in its own
		// words here, or not at all.
		if (extensions.scope) return extensions.scope(persona) || undefined;
		// How current, beside what is not held: a miss on yesterday's news then
		// reads as dated rather than broken. The oldest check among the
		// collections a question reaches is the one that bounds the answer.
		const reached = collection
			? collections.filter((c) => c.name === collection)
			: group
				? collections.filter((c) => c.subject?.name === group)
				: collections;
		const dates = reached.map((c) => c.documents_to);
		const oldest = dates.length > 0 && dates.every(Boolean) ? dates.toSorted()[0] : null;
		const held = persona.not_held ? `${who} does not hold ${persona.not_held}.` : '';
		return [held, oldest ? documentsTo(oldest) : ''].filter(Boolean).join(' ') || undefined;
	});

	/** This page's address with the conversation named (or none), keeping the collection or subject. */
	function address(conversation?: string | null): string {
		const query = new SvelteURLSearchParams();
		if (collection) query.set('collection', collection);
		else if (group) query.set('group', group);
		if (conversation) query.set('c', conversation);
		const text = query.toString();
		return text ? `?${text}` : page.url.pathname;
	}

	// SvelteKit keeps this page across `/chat/<id>`, so the persona is read from
	// the address whenever it changes, never once: a link to another persona
	// leaves this one's conversation and starts that persona's.
	$effect(() => {
		const id = personaId;
		untrack(() => void enter(id));
	});

	async function enter(id: string | undefined) {
		chat?.new();
		chat = null;
		persona = null;
		collections = [];
		listed = false;
		missing = false;
		listOpen = false;
		// Read beside the personas, and waited on by nothing: a persona that
		// reads no collections has its answer discarded.
		const pending = id ? collectionsOf({ id }).catch((): Collection[] => []) : null;
		const found = await personasOf()
			.then((all) => all.find((p) => p.id === id) ?? null)
			.catch(() => null);
		if (personaId !== id) return;
		missing = found === null;
		if (!found) return;
		const card = extensions.briefing?.(found);
		chat = new Chat(chatTransport(found), {
			artefact: (kind) =>
				kind === BRIEFING && card
					? { title: card.title, summary: card.summary, isAnswer: true }
					: undefined
		});
		persona = found;
		void chat.list();
		if (!found.collections || !pending) {
			listed = true;
			return;
		}
		void pending.then((list) => {
			if (personaId !== id) return;
			collections = list;
			listed = true;
		});
	}

	// The address names the conversation: a link, the back button or the list
	// opens one, and no address is a new one. A question handed over by address
	// waits in its box, unsent. Either leaves the entry at once, so nothing puts
	// it back on Back, a reload, or over what the person types next.
	$effect(() => {
		const want = wanted;
		const question = handed;
		const current = chat;
		if (!current) return;
		untrack(() => {
			if (!want) {
				current.new();
				if (!question) return;
				current.draft = question;
				void goto(address(), { replaceState: true, keepFocus: true, noScroll: true });
			} else if (want !== current.conversationId) void reopen(current, want);
		});
	});

	// A question handed over in navigation state, with its files, is asked at
	// once, and clearing the state from the entry is this effect's own doing: it
	// must not start the address effect over, which would see no conversation yet
	// and discard the turn just begun. So it follows `asked` alone, declared after the address
	// effect so a new conversation is started before the question goes into it.
	$effect(() => {
		const ask = asked;
		const current = chat;
		if (!current || !ask) return;
		untrack(() => {
			const { files, kind } = page.state;
			void goto(address(), { replaceState: true, keepFocus: true, noScroll: true, state: {} });
			void current.ask(
				ask,
				typeof kind === 'string' ? kind : undefined,
				collection,
				Array.isArray(files) ? files.filter((f) => f instanceof File) : [],
				group
			);
		});
	});

	// ...and a conversation the persona has just named goes into the address, so
	// a refresh or a copied link finds it.
	$effect(() => {
		const named = chat?.conversationId;
		if (named && named !== untrack(() => wanted)) {
			void goto(
				untrack(() => address(named)),
				{
					replaceState: true,
					keepFocus: true,
					noScroll: true
				}
			);
		}
	});

	/** A link to a conversation that cannot be read (deleted, or not this
	 *  person's) says so and leaves the address, rather than sitting on it. */
	async function reopen(current: Chat, id: string) {
		if (await current.open(id)) return;
		if (page.url.searchParams.get('c') !== id) return;
		toast.info("That conversation can't be opened. It may have been deleted.");
		await goto(address(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function fresh() {
		listOpen = false;
		void goto(address(), { keepFocus: true, noScroll: true });
	}

	/**
	 * Narrows the next question to one collection, one subject, or all of them,
	 * in the address. The picker calls `oncollection` and `ongroup` together for
	 * one pick, so the two are taken as one change and the address moves once.
	 */
	let picked: { collection?: string; group?: string } | null = null;
	function narrow(next: { collection?: string } | { group?: string }) {
		picked = { ...(picked ?? {}), ...next };
		queueMicrotask(() => {
			const pick = picked;
			picked = null;
			if (!pick) return;
			const query = new SvelteURLSearchParams(page.url.searchParams);
			query.delete('collection');
			query.delete('group');
			if (pick.collection) query.set('collection', pick.collection);
			else if (pick.group) query.set('group', pick.group);
			void goto(`?${query}`, { replaceState: true, keepFocus: true, noScroll: true });
		});
	}

	async function remove(id: string): Promise<boolean> {
		const removed = (await chat?.remove(id)) ?? false;
		if (removed && wanted === id) fresh();
		return removed;
	}

	/** Every past question but one still being answered; the open one cleared leaves a new one. */
	async function clearAll() {
		clearing = false;
		const open = wanted;
		if (!(await chat?.clear())) {
			toast.error(words.clearAllFailed);
			return;
		}
		if (open && !chat?.conversations?.some((c) => c.id === open)) fresh();
	}
</script>

{#if missing}
	<EmptyState
		title="Nothing to ask here"
		description="You have not been given access to this, or it is no longer offered."
	/>
{:else if !persona || !chat}
	<LoadingState />
{:else}
	{@const c = chat}
	{@const p = persona}
	<!-- Nothing of the shell floats over the composer: feedback is the bar's, and
	     the phone drawer's; so is the way to past questions where their column
	     does not show. -->
	{#if !wide}
		<ShellActions>
			<Button
				variant="outline"
				size="icon"
				aria-label={words.pastQuestions}
				title={words.pastQuestions}
				aria-haspopup="dialog"
				aria-expanded={listOpen}
				onclick={() => (listOpen = true)}
				data-testid="chat-past-questions"
				class="pointer-coarse:size-11"
			>
				<HistoryIcon />
			</Button>
		</ShellActions>
	{/if}
	<div class="flex h-full min-h-0 flex-1">
		{#if wide}
			<!-- A second column flush against the rail, sized as the rail is (the
			     shell's own tokens, open and folded): no width of its own. -->
			<div
				class="border-border flex min-h-0 flex-none flex-col border-r {folded
					? 'w-(--ds-shell-rail-width-collapsed)'
					: 'w-(--ds-shell-rail-width)'}"
				data-testid="chat-past-column"
			>
				{#if folded}
					<div class="flex flex-col items-center gap-1 py-2">
						<Button
							variant="ghost"
							size="icon"
							aria-label={words.showPastQuestions}
							title={words.showPastQuestions}
							onclick={() => fold(false)}
						>
							<PanelLeftOpenIcon />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={words.newQuestion}
							title={words.newQuestion}
							onclick={fresh}
						>
							<SquarePenIcon />
						</Button>
					</div>
				{:else}
					<div class="min-h-0 flex-1 overflow-y-auto">
						{@render past(c, () => fold(true))}
					</div>
					{@render clearFoot(c)}
				{/if}
			</div>
		{/if}
		<Conversation
			turns={c.turns}
			running={c.busy}
			version={c.version}
			answering={c.answering}
			reopening={Boolean(c.conversationId) && c.turns.length === 0}
			name={who}
			welcome={p.blurb || undefined}
			examples={p.examples}
			onexample={(question) => (c.draft = question)}
			{scope}
			onregenerate={() => void c.again()}
			onmark={(turn, verdict) => c.mark(turn, verdict)}
			onshare={(turn, share) => c.share(turn, share)}
			onedit={(position, text) => c.edit(position, text)}
			loadWritten={(name, version) => c.loadArtefact(name, version)}
			writtenUrl={(name, version, format) => c.artefactUrl(name, version, format)}
			{visuals}
			loadDocument={p.collections && !extensions.oncite ? personaDocuments(p) : undefined}
			oncite={extensions.oncite ? (citation) => extensions.oncite!(p, citation) : undefined}
			describeTool={extensions.describeTool}
			turn={extensions.Turn ? presented : undefined}
			lead={extensions.Home && !c.conversationId ? home : undefined}
			working={extensions.Thinking ? thinking : undefined}
			retrieves={Boolean(p.collections)}
			onstop={() => void c.stop()}
			toolbar={!wide && (c.conversationId || c.turns.length > 0) ? newQuestion : undefined}
			{formatCost}
			{copy}
		>
			{#snippet composer()}
				<FairUseNotice quota={c.quota} supportHref={c.quota?.support_url ?? undefined} {copy} />
				<AskBox
					persona={p}
					bind:value={c.draft}
					bind:files={c.files}
					running={c.busy}
					sendWhileRunning={c.sendWhileRunning}
					collections={choices}
					{collection}
					{group}
					oncollection={(name) => narrow({ collection: name })}
					ongroup={(name) => narrow({ group: name })}
					turnCount={c.turns.length}
					onnewquestion={fresh}
					onsubmit={() => void c.ask(undefined, undefined, collection, [], group)}
					onstop={() => void c.stop()}
				/>
			{/snippet}
		</Conversation>
	</div>
	<Sheet.Root open={listOpen && !wide} onOpenChange={(open) => (listOpen = open)}>
		<Sheet.Content
			side="left"
			showCloseButton={false}
			aria-label={words.pastQuestions}
			class="gap-0"
		>
			<div class="min-h-0 flex-1 overflow-y-auto">
				{@render past(c)}
			</div>
			{@render clearFoot(c)}
		</Sheet.Content>
	</Sheet.Root>
	<AlertDialog.Root
		open={clearing}
		onOpenChange={(open) => {
			if (!open) clearing = false;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{words.clearAllPrompt}</AlertDialog.Title>
				<AlertDialog.Description>{words.clearAllDetail}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{words.cancel}</AlertDialog.Cancel>
				<AlertDialog.Action
					variant="destructive"
					onclick={() => void clearAll()}
					data-testid="chat-clear-all-confirm"
				>
					{words.clearAll}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}

<!-- A new conversation, from the bar above the transcript where the column does not show. -->
{#snippet newQuestion()}
	<Button variant="ghost" size="sm" onclick={fresh}>
		<SquarePenIcon />
		{words.newQuestion}
	</Button>
{/snippet}

<!-- Past questions, in the column or the sheet: New question at their head,
     each row dated under its day, each with its acts. -->
{#snippet past(c: Chat, oncollapse?: () => void)}
	<ConversationList
		conversations={c.conversations}
		failed={c.listFailed}
		current={c.conversationId}
		href={(id) => address(id)}
		onopen={() => (listOpen = false)}
		onnew={fresh}
		onclose={oncollapse ? undefined : () => (listOpen = false)}
		{oncollapse}
		onrename={(id, title) => c.rename(id, title)}
		ondownload={(id) => c.download(id)}
		ondelete={remove}
		name={who}
		{copy}
	/>
{/snippet}

<!-- Clear all, at the foot of past questions, behind its confirmation. -->
{#snippet clearFoot(c: Chat)}
	{#if c.clearable && (c.conversations?.length ?? 0) > 0}
		<div class="border-border flex-none border-t p-2">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground w-full justify-start"
				onclick={() => (clearing = true)}
				data-testid="chat-clear-all"
			>
				<TrashIcon />
				{words.clearAll}
			</Button>
		</div>
	{/if}
{/snippet}

{#snippet presented(props: AgentTranscriptProps)}
	{#if extensions.Turn && persona}
		<extensions.Turn {...props} {persona} />
	{/if}
{/snippet}

{#snippet thinking(line: { label?: string; since?: number })}
	{#if extensions.Thinking && persona}
		<extensions.Thinking {persona} {...line} />
	{/if}
{/snippet}

{#snippet home()}
	{#if extensions.Home && persona}
		<extensions.Home {persona} />
	{/if}
{/snippet}
