<!--
  An artefact's card in the transcript: what a reader taps to open it.

  It is not the artefact itself. Every word on it is the host's — what the
  thing is called and what it holds — and opening it is the host's too, in
  whatever column the host keeps for it; the package's own `ArtefactPane` is
  one such column, for an artefact that is the answer's own prose.

  One button, not a card with a button in it: the whole row is the target,
  so a thumb that lands on the summary still opens it.
-->
<script lang="ts">
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import type { Artefact } from '../../transcript.svelte';
	import { resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		artefact: Artefact;
		/** The host is showing it now. */
		open?: boolean;
		/** Omit and the card informs but does not open: a host with nowhere
		 *  to show the artefact offers no action rather than a dead one. */
		onopen?: () => void;
		copy?: Partial<LibrarianCopy>;
	}

	let { artefact, open = false, onopen, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));
</script>

<button
	type="button"
	class="ds-lib-artefact"
	class:is-open={open}
	onclick={() => onopen?.()}
	disabled={!onopen}
>
	<span class="ds-lib-artefact-icon" aria-hidden="true"><FileTextIcon size={16} /></span>
	<span class="ds-lib-artefact-text">
		<span class="ds-lib-artefact-title">{artefact.title}</span>
		{#if artefact.summary}<span class="ds-lib-artefact-summary">{artefact.summary}</span>{/if}
	</span>
	{#if onopen}
		<span class="ds-lib-artefact-action">{open ? words.showingArtefact : words.openArtefact}</span>
	{/if}
</button>

<style>
	.ds-lib-artefact {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.625rem 0.75rem;
		color: var(--ds-color-foreground);
		font: inherit;
		text-align: start;
		cursor: pointer;
		transition: border-color 150ms ease;
	}

	.ds-lib-artefact:hover:not(:disabled) {
		border-color: var(--ds-color-border-strong);
	}

	.ds-lib-artefact:disabled {
		cursor: default;
	}

	.ds-lib-artefact:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	/* The primary edge, not a fill: the card says "this is what is open" and
	   the column beside it carries the weight. */
	.ds-lib-artefact.is-open {
		border-color: var(--ds-color-primary);
	}

	.ds-lib-artefact-icon {
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

	.ds-lib-artefact-text {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.ds-lib-artefact-title {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25rem;
	}

	.ds-lib-artefact-summary {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		overflow-wrap: anywhere;
	}

	.ds-lib-artefact-action {
		flex: none;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		padding: 0.25rem 0.625rem;
		font-size: 0.8125rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-artefact {
			transition: none;
		}
	}
</style>
