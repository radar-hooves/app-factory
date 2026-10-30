<script lang="ts">
	/**
	 * The chat lab.
	 *
	 * Every state @poodle64/librarian can be in, on one route, driven by
	 * `?state=` so a screenshot grid across three widths and two themes is one
	 * script rather than seven hand-taken shots. It composes the SHIPPED
	 * components against fixture data — nothing here reimplements any of them,
	 * so a defect on this page is a defect in the package.
	 *
	 * The composer is live: typing, growing, attaching and sending all work,
	 * and sending appends a turn from the fixtures. What it cannot do is reach
	 * a real model, which is the point — see chat-fixtures.ts.
	 */
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import { Button } from '@poodle64/ui/button';
	import * as Sheet from '@poodle64/ui/sheet';
	import Conversation from '@poodle64/librarian/conversation';
	import Composer from '@poodle64/librarian/composer';
	import ConversationList from '@poodle64/librarian/conversation-list';
	import FairUseNotice from '@poodle64/librarian/fair-use-notice';
	import { Chat, type ConversationSummary, type Quota } from '@poodle64/librarian/chat';
	import type { Turn } from '@poodle64/librarian/transcript';
	import type { Citation } from '@poodle64/librarian/citations';
	import type { CollectionChoice } from '@poodle64/librarian/composer';
	import {
		EXAMPLES,
		JOB_COPY,
		JOB_NOTE,
		JOB_READING,
		JOB_WORDS,
		labChat,
		loadDocument,
		scene,
		SCOPE,
		type LabState
	} from '$lib/chat-fixtures';

	const STATES: LabState[] = [
		'empty',
		'working',
		'streaming',
		'answer',
		'citations',
		'sources',
		'attachments',
		'narration',
		'not-held',
		'error',
		'stopped',
		'chat',
		'persona',
		'job',
		'job-showing',
		'job-live',
		'job-schema',
		'answering',
		'mark',
		'fair-use',
		'limit',
		'past',
		'live',
		'cost',
		'collections',
		'collections-long'
	];

	const NOTICE =
		'Your questions go to Anthropic, which runs the model. A conversation left for seven days is deleted. [More on the About page](/about).';

	const requested = $derived((page.url.searchParams.get('state') ?? 'answer') as LabState);

	let turns = $state<Turn[]>([]);
	let running = $state(false);
	let value = $state('');
	let files = $state<File[]>([]);
	let version = $state(0);
	// Whose surface this is. Only the `persona` scene renames it, and renaming
	// it is the whole test: every word the package says has to follow.
	let name = $state('Outrider');
	// Bumping `version` from an effect that also READ it would re-trigger the
	// effect; the counter it is set from is a plain variable for that reason.
	let bump = 0;
	let collection = $state<string | undefined>(undefined);
	let group = $state<string | undefined>(undefined);
	let collections = $state<CollectionChoice[]>([]);
	// A job surface: the host keeps its own column for the artefact and its
	// own page viewer, and the package only hands it the taps.
	let job = $state(false);
	let showing = $state<string | undefined>(undefined);
	let viewing = $state<Citation | null>(null);
	let answering = $state<number | null>(null);
	let mark = $state(false);
	let quota = $state<Quota | null>(null);
	let past = $state<ConversationSummary[] | null>(null);
	let current = $state<string | undefined>(undefined);
	let listOpen = $state(false);
	const formatCost = (usd: number) => `about A$${(usd * 1.5).toFixed(2)}`;
	// `live` is the package's own controller over a fake of the chat routes,
	// driven rather than seeded: every other scene is a picture.
	let live = $state(false);
	const chat = new Chat(labChat(), { pollMs: 1500 });

	// Re-seeding on the query parameter rather than on a click keeps the driver
	// and the eye on exactly the same code path.
	$effect(() => {
		const next = scene(requested);
		turns = next.turns;
		running = next.running;
		value = next.value;
		files = next.files;
		name = next.name;
		job = next.job ?? false;
		showing = next.showing;
		viewing = null;
		collections = next.collections ?? [];
		collection = undefined;
		group = undefined;
		answering = next.answeringFor === undefined ? null : Date.now() - next.answeringFor;
		mark = next.mark ?? false;
		quota = next.quota ?? null;
		past = next.past ?? null;
		current = next.current;
		live = next.live ?? false;
		if (next.live) {
			chat.new();
			void chat.list();
		}
		version = ++bump;
	});

	function send() {
		const asked = value.trim();
		if (!asked) return;
		turns = [
			...turns,
			{ id: `turn-${turns.length + 1}`, question: asked, blocks: [], outcome: null }
		];
		value = '';
		files = [];
		running = true;
		version = ++bump;
	}
</script>

<div class="bg-background text-foreground flex h-dvh flex-col">
	<header
		class="border-border flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2 text-xs"
	>
		<span class="text-muted-foreground pr-1 font-medium">chat</span>
		{#each STATES as state (state)}
			<a
				href="/chat?state={state}"
				class="rounded-full border px-2 py-0.5 transition-colors {requested === state
					? 'border-primary/40 bg-primary/15 text-foreground'
					: 'text-muted-foreground hover:text-foreground border-transparent'}"
			>
				{state}
			</a>
		{/each}
		<span class="flex-1"></span>
		<button
			type="button"
			onclick={toggleMode}
			class="border-border text-muted-foreground hover:text-foreground rounded-full border px-2 py-0.5"
		>
			theme
		</button>
	</header>

	<div class="relative flex min-h-0 flex-1">
		<!-- The host's placement, as the stamped chat page has it: past questions
		     over the page from the bar above the transcript, never a column. -->
		<Sheet.Root bind:open={listOpen}>
			<Sheet.Content side="left" showCloseButton={false} aria-label="Past questions" class="overflow-y-auto">
				{#if live}
					<ConversationList
						conversations={chat.conversations}
						failed={chat.listFailed}
						current={chat.conversationId}
						onopen={(id) => {
							listOpen = false;
							void chat.open(id);
						}}
						onnew={() => {
							listOpen = false;
							chat.new();
						}}
						onclose={() => (listOpen = false)}
						onrename={(id, title) => chat.rename(id, title)}
						ondownload={(id) => chat.download(id)}
						ondelete={(id) => chat.remove(id)}
					/>
				{:else}
					<ConversationList
						conversations={past}
						{current}
						onopen={(id) => (current = id)}
						onnew={() => (current = undefined)}
						onclose={() => (listOpen = false)}
						onrename={async () => true}
						ondownload={async () => true}
						ondelete={async () => true}
					/>
				{/if}
			</Sheet.Content>
		</Sheet.Root>
		{#if live}
			<Conversation
				turns={chat.turns}
				running={chat.busy}
				version={chat.version}
				{name}
				answering={chat.answering}
				examples={['What is the total on this receipt?']}
				onexample={(question) => (chat.draft = question)}
				onregenerate={() => void chat.again()}
				onmark={(turn, verdict) => chat.mark(turn, verdict)}
				{loadDocument}
				toolbar={bar}
			>
				{#snippet composer()}
					<FairUseNotice quota={chat.quota} />
					<Composer
						bind:value={chat.draft}
						bind:files={chat.files}
						running={chat.busy}
						{name}
						onsubmit={() => void chat.ask()}
						onstop={() => void chat.stop()}
					/>
				{/snippet}
			</Conversation>
		{:else}
		{#if job && showing}
			<!-- The host's own column, not the package's pane: what the run handed
			     in, beside the conversation that explains it. -->
			<aside
				aria-label={JOB_READING.title}
				class="border-border hidden w-72 shrink-0 flex-col gap-1 border-r p-4 text-sm md:flex"
			>
				<h2 class="font-semibold">{JOB_READING.title}</h2>
				<p class="text-muted-foreground text-xs">{JOB_READING.summary}</p>
			</aside>
		{/if}
		<Conversation
			{turns}
			{running}
			{version}
			{name}
			examples={EXAMPLES}
			scope={job ? undefined : SCOPE}
			describeTool={job ? JOB_WORDS : undefined}
			copy={job ? JOB_COPY : undefined}
			onopenartefact={job
				? (turn) => (showing = showing === turn.id ? undefined : turn.id)
				: undefined}
			{showing}
			{answering}
			onmark={mark ? async () => true : undefined}
			oncite={job ? (citation) => (viewing = citation) : undefined}
			welcome={name === 'Outrider'
				? 'Ask Outrider about ADF pay, allowances, leave and conditions of service.'
				: undefined}
			onexample={(question) => {
				value = question;
			}}
			onregenerate={() => {
				running = true;
				version = ++bump;
			}}
			{loadDocument}
			formatCost={requested === 'cost' ? formatCost : undefined}
			toolbar={past ? bar : undefined}
		>
			{#snippet composer()}
				{#if job}
					<Composer
						bind:value
						bind:files
						{running}
						{name}
						copy={JOB_COPY}
						note={JOB_NOTE}
						sendWhileRunning
						onsubmit={send}
						onstop={() => (running = false)}
					/>
				{:else}
					<FairUseNotice {quota} />
					<Composer
						bind:value
						bind:files
						{running}
						{collections}
						{collection}
						{group}
						{name}
						oncollection={(next) => (collection = next)}
						ongroup={(next) => (group = next)}
						onsubmit={send}
						onstop={() => (running = false)}
						copy={page.url.searchParams.has('notice') ? { composerNotice: NOTICE } : undefined}
						turnCount={requested === 'cost' ? 9 : undefined}
						onnewquestion={requested === 'cost' ? () => (turns = []) : undefined}
					/>
				{/if}
			{/snippet}
		</Conversation>
		{#if viewing}
			<!-- The host's page viewer, standing in for one that draws the page. -->
			<aside
				aria-label="Page viewer"
				class="border-border hidden w-72 shrink-0 flex-col gap-1 border-l p-4 text-sm md:flex"
			>
				<h2 class="font-semibold">{viewing.title} · {viewing.section}</h2>
				<button type="button" class="text-muted-foreground text-xs" onclick={() => (viewing = null)}>
					Close
				</button>
			</aside>
		{/if}
		{/if}
	</div>
</div>

{#snippet bar()}
	{#if live && chat.conversationId}
		<Button variant="ghost" size="sm" onclick={() => chat.new()}>
			<SquarePenIcon />
			New question
		</Button>
	{/if}
	<Button
		variant="ghost"
		size="sm"
		aria-haspopup="dialog"
		aria-expanded={listOpen}
		onclick={() => (listOpen = true)}
	>
		<HistoryIcon />
		Past questions
	</Button>
{/snippet}
