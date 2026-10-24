<!--
	A Home page's question box for `persona` (its id): the chat page's own box
	(`AskBox`), whose send hands the question, its files, the scope and the
	briefing choice to the chat page (`handOff`) and awaits nothing. It readies
	that page as it mounts (`warmChat`) and renders once the persona is known.
	Place it where the page wants the box; give it no styling of its own.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BRIEFING,
		collectionsOf,
		handOff,
		personasOf,
		warmChat,
		type Collection,
		type Persona
	} from '$lib/agent/chat';
	import AskBox from '$lib/agent/ask-box.svelte';

	let { persona: id }: { persona: string } = $props();

	let persona = $state<Persona | null>(null);
	let collections = $state<Collection[]>([]);
	let collection = $state<string | undefined>();
	let group = $state<string | undefined>();
	let value = $state('');
	let files = $state<File[]>([]);

	onMount(() => {
		warmChat(id);
		void personasOf()
			.then((all) => {
				persona = all.find((p) => p.id === id) ?? null;
				return persona?.collections ? collectionsOf(persona) : [];
			})
			.then((list) => (collections = list))
			.catch(() => undefined);
	});

	function send(ask: string, kind?: string) {
		void handOff(id, { ask: ask.trim(), files, collection, group, kind });
	}
</script>

{#if persona}
	<AskBox
		{persona}
		bind:value
		bind:files
		running={false}
		{collections}
		{collection}
		{group}
		oncollection={(name) => (collection = name)}
		ongroup={(name) => (group = name)}
		onsubmit={() => value.trim() && send(value)}
		onstop={() => undefined}
		onbriefing={(card) => send(card.question, BRIEFING)}
	/>
{/if}
