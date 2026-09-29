<script lang="ts">
	/**
	 * The librarian lab.
	 *
	 * Every state @poodle64/librarian can be in, on one route, driven by
	 * `?state=` so a screenshot grid across three widths and two themes is one
	 * script rather than seven hand-taken shots. It composes the SHIPPED
	 * components against fixture data — nothing here reimplements any of them,
	 * so a defect on this page is a defect in the package.
	 *
	 * The composer is live: typing, growing, attaching and sending all work,
	 * and sending appends a turn from the fixtures. What it cannot do is reach
	 * a real model, which is the point — see librarian-fixtures.ts.
	 */
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import Conversation from '@poodle64/librarian/conversation';
	import Composer, { type Scope } from '@poodle64/librarian/composer';
	import type { Turn } from '@poodle64/librarian/transcript';
	import type { Citation } from '@poodle64/librarian/citations';
	import {
		EXAMPLES,
		JOB_COPY,
		JOB_NOTE,
		JOB_READING,
		JOB_WORDS,
		loadDocument,
		scene,
		SCOPE,
		type LabState
	} from '$lib/librarian-fixtures';

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
		'job-schema'
	];

	const requested = $derived((page.url.searchParams.get('state') ?? 'answer') as LabState);

	let turns = $state<Turn[]>([]);
	let running = $state(false);
	let value = $state('');
	let files = $state<File[]>([]);
	let version = $state(0);
	// Whose surface this is. Only the `persona` scene renames it, and renaming
	// it is the whole test: every word the package says has to follow.
	let name = $state('Milton');
	// Bumping `version` from an effect that also READ it would re-trigger the
	// effect; the counter it is set from is a plain variable for that reason.
	let bump = 0;
	let scope = $state<Scope>('library');
	// A job surface: the host keeps its own column for the artefact and its
	// own page viewer, and the package only hands it the taps.
	let job = $state(false);
	let showing = $state<string | undefined>(undefined);
	let viewing = $state<Citation | null>(null);

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
		<span class="text-muted-foreground pr-1 font-medium">librarian</span>
		{#each STATES as state (state)}
			<a
				href="/librarian?state={state}"
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

	<div class="flex min-h-0 flex-1">
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
			oncite={job ? (citation) => (viewing = citation) : undefined}
			welcome={name === 'Milton'
				? 'Ask Milton about ADF pay, allowances, leave and conditions of service.'
				: undefined}
			onexample={(question) => {
				value = question;
			}}
			onsuggest={(followUp) => {
				value = followUp;
				send();
			}}
			onregenerate={() => {
				running = true;
				version = ++bump;
			}}
			{loadDocument}
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
					<Composer
						bind:value
						bind:files
						{running}
						{scope}
						{name}
						onscope={(next) => (scope = next)}
						onsubmit={send}
						onstop={() => (running = false)}
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
	</div>
</div>
