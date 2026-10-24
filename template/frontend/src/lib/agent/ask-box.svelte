<!--
	The one question box: the librarian's Composer (attach, briefing, the scope
	picker, send) with the persona's name, its words and its briefing filled in
	from `$lib/agent/app`. The chat page and a Home page's `AskHome` both
	render this, so the two are the same box; they differ only in what sending
	does. A briefing control appears where the host takes one (`onbriefing`,
	which a Home page's box does and the chat page does not) and the app
	declares one, and hands it the card. Attach shows only for a persona that
	takes files (`attachments`). It takes the persona's collections as
	the app lists them and offers each as the picker shows it: its short title,
	under its subject, a subject picked whole through `group` and `ongroup`.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import Composer from '@poodle64/librarian/composer';
	import * as app from '$lib/agent/app';
	import {
		choiceOf,
		type Briefing,
		type ChatExtensions,
		type Collection,
		type Persona
	} from '$lib/agent/chat';

	type Props = Omit<
		ComponentProps<typeof Composer>,
		'name' | 'copy' | 'onbriefing' | 'collections' | 'attachments'
	> & {
		persona: Persona;
		/** The persona's collections as the app lists them. */
		collections?: Collection[];
		onbriefing?: (briefing: Briefing) => void;
	};

	let {
		persona,
		value = $bindable(),
		files = $bindable([]),
		collections = [],
		onbriefing,
		...rest
	}: Props = $props();

	const extensions: ChatExtensions = app;
	const card = $derived(extensions.briefing?.(persona));
	const choices = $derived(collections.map(choiceOf));
</script>

<Composer
	bind:value
	bind:files
	name={persona.name}
	copy={extensions.copy?.(persona)}
	collections={choices}
	attachments={persona.attachments}
	onbriefing={card && onbriefing ? () => onbriefing(card) : undefined}
	{...rest}
/>
