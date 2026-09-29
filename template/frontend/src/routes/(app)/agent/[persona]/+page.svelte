<!--
	The agent console: one persona, chatting. Built from @poodle64/librarian's
	own components rather than hand-rolled — the library owns Milton's whole
	conversation surface as a package (transcript state, streaming, the
	composer, citation chips), and this route is the factory's minimal host
	for it (docs/design/agent-console.md §Decision).

	Deliberately thin next to the library's own `/agent` page: no corpus tree,
	no document pane, no scope chips — a persona here is a chat, not a
	reading room, so this mirrors the package's own generic example (its
	README) rather than the library's domain-specific one.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ask } from '@poodle64/librarian/client';
	import Composer from '@poodle64/librarian/composer';
	import Conversation from '@poodle64/librarian/conversation';
	import { Transcript, type Turn } from '@poodle64/librarian/transcript';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { api } from '$lib/api';

	const persona = $derived(page.params.persona ?? '');

	// Checked once, against the caller's OWN entitlements
	// (GET /api/agent/personas already narrows to them) — not because asking
	// an unentitled or unknown persona would misbehave (`ask()` folds that
	// into an in-transcript error), but because "an app with no persona
	// directory renders no console" means this route should say so up front
	// rather than open on a composer that can only ever fail.
	let loading = $state(true);
	let available = $state(false);

	onMount(async () => {
		const { data } = await api.GET('/api/agent/personas');
		available = (data ?? []).includes(persona);
		loading = false;
	});

	let question = $state('');
	let asked = $state('');
	let turns = $state<Turn[]>([]);
	let running = $state(false);
	let controller: AbortController | null = null;
	let sessionId = $state<string | null>(null);
	const transcript = new Transcript();

	async function run(text: string) {
		running = true;
		controller = new AbortController();
		transcript.reset();
		turns = [...turns, { id: crypto.randomUUID(), question: text, blocks: [], outcome: null }];

		try {
			for await (const event of ask({
				question: text,
				resume: sessionId,
				endpoint: `/api/agent/${persona}/ask`,
				signal: controller.signal
			})) {
				transcript.apply(event);
				if (transcript.sessionId) sessionId = transcript.sessionId;
				const live = turns.at(-1);
				if (live) {
					live.blocks = transcript.blocks;
					live.outcome = transcript.outcome;
				}
			}
		} finally {
			running = false;
			controller = null;
		}
	}

	async function submit() {
		const text = question.trim();
		if (!text || running) return;
		question = '';
		asked = text;
		await run(text);
	}

	function stop() {
		controller?.abort();
		running = false;
	}
</script>

{#if loading}
	<LoadingState message="Loading {persona}…" />
{:else if !available}
	<EmptyState title="No such persona" description="{persona} is not configured for this app." />
{:else}
	<div class="flex h-full min-h-0 flex-1 flex-col">
		<Conversation
			{turns}
			{running}
			version={transcript.version}
			name={persona}
			onregenerate={() => run(asked)}
		>
			{#snippet composer()}
				<Composer
					bind:value={question}
					{running}
					name={persona}
					scope="library"
					onscope={() => {}}
					attachments={false}
					onsubmit={submit}
					onstop={stop}
				/>
			{/snippet}
		</Conversation>
	</div>
{/if}
