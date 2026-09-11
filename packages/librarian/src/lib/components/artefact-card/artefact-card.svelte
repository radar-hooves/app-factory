<!--
  A study artefact's card in the transcript: what a colleague taps to read it.
  It is not the artefact itself — that lives in the reading column
  (`ArtefactPane`), never stacked beside this card and never inline as prose,
  which is the whole of the one-surface decision this package exists to keep
  every consumer honest about.
-->
<script lang="ts">
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import Panel from '@poodle64/ui/panel';

	interface Props {
		title: string;
		citationCount: number;
		onopen: () => void;
	}

	let { title, citationCount, onopen }: Props = $props();
</script>

<Panel
	icon={FileTextIcon}
	{title}
	subtitle="Briefing doc"
	role="button"
	tabindex={0}
	onclick={onopen}
	onkeydown={(event: KeyboardEvent) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onopen();
	}}
	class="hover:border-border-strong focus-visible:ring-ring w-full max-w-[28rem] cursor-pointer text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
>
	{#snippet children()}
		<p class="text-muted-foreground text-xs">
			{citationCount} source{citationCount === 1 ? '' : 's'}
		</p>
	{/snippet}
</Panel>
