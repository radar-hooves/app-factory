<!--
  A document the persona wrote, as a card in the turn: its name and version,
  Open (the reading column shows that version) and a download link for the
  source and for each format the app renders it as.
-->
<script lang="ts">
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { fill, resolveCopy, type ChatCopy } from '../../copy';
	import { downloads, type Written, type WrittenUrl } from '../../written';

	interface Props {
		written: Written;
		/** The column is showing this version now. */
		open?: boolean;
		/** Omit and the card lists and links but does not open. */
		onopen?: () => void;
		/** Omit and no download links render. */
		url?: WrittenUrl;
		copy?: Partial<ChatCopy>;
	}

	let { written, open = false, onopen, url, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));
</script>

<div class="ds-lib-written" class:is-open={open}>
	<span class="ds-lib-written-icon" aria-hidden="true"><FileTextIcon size={16} /></span>
	<span class="ds-lib-written-text">
		<span class="ds-lib-written-name">{written.name}</span>
		<span class="ds-lib-written-version">{fill(words.writtenVersion, { n: written.version })}</span>
	</span>
	{#if onopen}
		<button type="button" class="ds-lib-written-open" onclick={onopen}>
			{open ? words.showingArtefact : words.openArtefact}
		</button>
	{/if}
	{#if url}
		<ul class="ds-lib-written-links" aria-label={words.download}>
			{#each downloads(written, words) as link (link.format)}
				<li><a href={url(written.name, written.version, link.format)}>{link.label}</a></li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.ds-lib-written {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.625rem 0.75rem;
	}

	.ds-lib-written.is-open {
		border-color: var(--ds-color-primary);
	}

	.ds-lib-written-icon {
		display: flex;
		width: 2rem;
		height: 2rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-written-text {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.ds-lib-written-name {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25rem;
		overflow-wrap: anywhere;
	}

	.ds-lib-written-version {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-written-open {
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.25rem 0.625rem;
		color: inherit;
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.ds-lib-written-open:focus-visible,
	.ds-lib-written-links a:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-written-links {
		display: flex;
		flex-basis: 100%;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		font-size: var(--ds-text-2xs);
		list-style: none;
	}

	.ds-lib-written-links a {
		color: var(--ds-color-muted-foreground);
		text-decoration: underline;
	}

	.ds-lib-written-links a:hover {
		color: var(--ds-color-foreground);
	}
</style>
