<!--
  A document the persona wrote, as a card in the turn: a page icon, its title,
  "Minute · 1 page · v1" and Open (the reading column shows that version),
  with a chip under it that downloads it: Word where the app renders one, else
  the source as written.
-->
<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { fill, resolveCopy, type ChatCopy } from '../../copy';
	import { chipFor, writtenMeta, type Written, type WrittenUrl } from '../../written';

	interface Props {
		written: Written;
		/** The column is showing this version now. */
		open?: boolean;
		/** Omit and the card lists and links but does not open. */
		onopen?: () => void;
		/** Omit and no download chip renders. */
		url?: WrittenUrl;
		copy?: Partial<ChatCopy>;
	}

	let { written, open = false, onopen, url, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));
	const chip = $derived(chipFor(written, words));
</script>

<div class="ds-lib-written">
	<div class="ds-lib-written-card" class:is-open={open}>
		<span class="ds-lib-written-icon" aria-hidden="true"><FileTextIcon size={20} /></span>
		<span class="ds-lib-written-text">
			<span class="ds-lib-written-name">{written.title}</span>
			<span class="ds-lib-written-meta">{writtenMeta(written, words)}</span>
		</span>
		{#if onopen}
			<button type="button" class="ds-lib-written-open" onclick={onopen}>
				{open ? words.showingArtefact : words.openArtefact}
			</button>
		{/if}
	</div>
	{#if url}
		<a
			class="ds-lib-written-chip"
			href={url(written.name, written.version, chip.format)}
			download={chip.file}
		>
			<FileTextIcon size={14} aria-hidden="true" />
			<span class="ds-lib-written-file">{chip.file}</span>
			<span class="ds-lib-written-format">
				{chip.label} · {fill(words.writtenVersion, { n: written.version })}
			</span>
			<span class="ds-lib-written-download">
				<DownloadIcon size={14} aria-hidden="true" />{words.download}
			</span>
		</a>
	{/if}
</div>

<style>
	.ds-lib-written {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.ds-lib-written-card {
		display: flex;
		width: 100%;
		max-width: 36rem;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.625rem 0.75rem;
	}

	.ds-lib-written-card.is-open {
		border-color: var(--ds-color-primary);
	}

	/* A sheet of paper: light in either theme, as the document is. */
	.ds-lib-written-icon {
		display: flex;
		width: 2.5rem;
		height: 2.75rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: var(--ds-radius-sm);
		background: var(--ds-paper, #f1f1ef);
		color: var(--ds-paper-ink, #1c1c1c);
	}

	.ds-lib-written-text {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.ds-lib-written-name {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.25rem;
		overflow-wrap: anywhere;
	}

	.ds-lib-written-meta {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-written-open {
		flex: none;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.5rem 0.625rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.ds-lib-written-open:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-written-open:focus-visible,
	.ds-lib-written-chip:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-written-chip {
		display: inline-flex;
		max-width: 100%;
		min-height: 2.25rem;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-full);
		padding: 0.25rem 0.75rem;
		color: var(--ds-color-foreground);
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.ds-lib-written-chip:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-written-file {
		min-width: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.ds-lib-written-format {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		white-space: nowrap;
	}

	.ds-lib-written-download {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-inline-start: 1px solid var(--ds-color-border);
		padding-inline-start: 0.5rem;
		font-size: var(--ds-text-2xs);
		white-space: nowrap;
	}
</style>
