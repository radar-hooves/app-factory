<!--
	One answer a colleague shared from a persona's chat, read-only: the question,
	the answer and its sources (app-factory docs/design/agent-console.md). Anyone
	who may chat with the persona reads it; anyone else is refused as the chat
	itself refuses them. It is the package's own `Conversation` over the one
	stored turn, with no handlers and no composer, so the app's own `Turn` and
	citations read here as they do in the chat.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
	import { storedTurn } from '@poodle64/librarian/chat';
	import Conversation from '@poodle64/librarian/conversation';
	import type { Turn } from '@poodle64/librarian/transcript';
	import { defaultVisuals } from '@poodle64/librarian/visuals';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { api } from '$lib/api';
	import * as app from '$lib/agent/app';
	import {
		personaDocuments,
		sharedAnswer,
		type ChatExtensions,
		type Persona
	} from '$lib/agent/chat';

	const extensions: ChatExtensions = app;
	const visuals = { ...defaultVisuals, ...extensions.visuals };

	let persona = $state<Persona | null>(null);
	let turn = $state<Turn | null>(null);
	let refused = $state<'persona' | 'answer' | null>(null);

	const who = $derived(persona?.name ?? '');
	const copy = $derived(persona ? extensions.copy?.(persona) : undefined);

	$effect(() => {
		const { persona: id = '', conversation = '', turn: at = '' } = page.params;
		untrack(() => void read(id, conversation, Number(at)));
	});

	async function read(id: string, conversation: string, at: number) {
		persona = null;
		turn = null;
		refused = null;
		const [personas, shared] = await Promise.all([
			api.GET('/api/agent/personas'),
			sharedAnswer(id, conversation, at).catch(() => null)
		]);
		const found = personas.data?.find((p) => p.id === id);
		if (!found) refused = 'persona';
		else if (!shared) refused = 'answer';
		else {
			persona = found;
			turn = storedTurn(conversation, at, shared);
		}
	}
</script>

{#if refused === 'persona'}
	<EmptyState
		title="Nothing to ask here"
		description="You have not been given access to this, or it is no longer offered."
	/>
{:else if refused === 'answer'}
	<EmptyState
		title="This answer is not shared"
		description="Whoever shared it may have stopped sharing it, or deleted the conversation."
	/>
{:else if !persona || !turn}
	<LoadingState />
{:else}
	{@const p = persona}
	<Conversation
		turns={[turn]}
		running={false}
		name={who}
		loadDocument={p.collections && !extensions.oncite ? personaDocuments(p) : undefined}
		oncite={extensions.oncite ? (citation) => extensions.oncite!(p, citation) : undefined}
		describeTool={extensions.describeTool}
		turn={extensions.Turn ? presented : undefined}
		lead={origin}
		{visuals}
		{copy}
	/>
{/if}

{#snippet origin()}
	{#if persona}
		<p class="text-muted-foreground text-sm">
			Shared from
			<a
				href="/chat/{persona.id}"
				class="text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline"
			>
				Ask {persona.name}
			</a>
		</p>
	{/if}
{/snippet}

{#snippet presented(props: AgentTranscriptProps)}
	{#if extensions.Turn && persona}
		<extensions.Turn {...props} {persona} />
	{/if}
{/snippet}
