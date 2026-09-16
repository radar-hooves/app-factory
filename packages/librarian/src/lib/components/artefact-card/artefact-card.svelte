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
	class="ds-lib-artefact-card"
>
	{#snippet children()}
		<p class="ds-lib-artefact-count">
			{citationCount} source{citationCount === 1 ? '' : 's'}
		</p>
	{/snippet}
</Panel>

<style>
	/* `:global`, and the only one in this package that is not prose inside
	   `{@html}`: the class goes to another component's root element, which
	   Svelte's scoping hash never reaches. */
	:global(.ds-lib-artefact-card) {
		width: 100%;
		max-width: 28rem;
		cursor: pointer;
		text-align: start;
		transition: border-color 150ms ease;
	}

	:global(.ds-lib-artefact-card:hover) {
		border-color: var(--ds-color-border-strong);
	}

	:global(.ds-lib-artefact-card:focus-visible) {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-artefact-count {
		margin: 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}
</style>
