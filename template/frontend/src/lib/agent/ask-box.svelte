<!--
	The one question box: the librarian's Composer (attach, briefing, the scope
	picker, send) with the persona's name, its words and its briefing filled in
	from `$lib/agent/app`. The chat page and a Home page's `AskHome` both
	render this, so the two are the same box; they differ only in what sending
	does. A briefing control appears when the app declares one, and hands the
	card to `onbriefing`.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import Composer from '@poodle64/librarian/composer';
	import * as app from '$lib/agent/app';
	import type { Briefing, ChatExtensions, Persona } from '$lib/agent/chat';

	type Props = Omit<ComponentProps<typeof Composer>, 'name' | 'copy' | 'onbriefing'> & {
		persona: Persona;
		onbriefing: (briefing: Briefing) => void;
	};

	let {
		persona,
		value = $bindable(),
		files = $bindable([]),
		onbriefing,
		...rest
	}: Props = $props();

	const extensions: ChatExtensions = app;
	const card = $derived(extensions.briefing?.(persona));
</script>

<Composer
	bind:value
	bind:files
	name={persona.name}
	copy={extensions.copy?.(persona)}
	onbriefing={card ? () => onbriefing(card) : undefined}
	{...rest}
/>
