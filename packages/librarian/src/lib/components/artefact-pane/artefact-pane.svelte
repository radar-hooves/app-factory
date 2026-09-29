<!--
  An artefact that is its answer's own prose, open in the reading column.

  The same shell shape `DocumentPane` uses (a column at 64rem, a bottom sheet
  below it) because decision 2 of the agent surface is that a colleague never
  has to learn which of the two things is in the column before they open it —
  only ever one, in the same place, closing whichever was there.
-->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { segment, type TextBlock, type Turn } from '../../transcript.svelte';
	import { resolveCitations, splitSources, type Citation } from '../../citations';
	import { resolveCopy, type LibrarianCopy } from '../../copy';
	import Markdown from '../markdown/markdown.svelte';
	import SourceList from '../source-list/source-list.svelte';

	interface Props {
		turn: Turn;
		onclose: () => void;
		/** Opens the cited document instead — swapping the column back, never
		 *  stacking it beside the artefact. Omit and the sources still list, but
		 *  do not open. */
		oncite?: (citation: Citation) => void;
		copy?: Partial<LibrarianCopy>;
	}

	let { turn, onclose, oncite, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	const texts = $derived(segment(turn.blocks).filter((s): s is TextBlock => s.kind === 'text'));
	const rawAnswer = $derived(texts.map((t) => t.text).join('\n\n'));
	const split = $derived(splitSources(rawAnswer));
	const sources = $derived(resolveCitations(turn.citations ?? [], split.citations));

	let closeButton = $state<HTMLButtonElement | null>(null);

	// Opening a pane a reader reached with the keyboard must move focus into
	// it, or Escape and Tab both act on the transcript behind it.
	$effect(() => {
		const returnTo = globalThis.document?.activeElement as HTMLElement | null;
		closeButton?.focus();
		return () => returnTo?.focus?.();
	});

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={keydown} />

<aside aria-label="Study artefact" class="ds-lib-pane">
	<!-- The sheet's grabber. On a phone this is an overlay a reader has to be
	     able to see the top edge of; on a desktop it is a column, so there is
	     nothing here to grab. -->
	<div class="ds-lib-pane-grabber" aria-hidden="true"><span></span></div>

	<header class="ds-lib-pane-header">
		<div class="ds-lib-pane-heading">
			<h2 class="ds-lib-pane-title">{turn.artefact?.title}</h2>
			{#if turn.artefact?.summary}
				<p class="ds-lib-pane-subtitle">{turn.artefact.summary}</p>
			{/if}
		</div>
		<button
			bind:this={closeButton}
			type="button"
			class="ds-lib-pane-close"
			onclick={onclose}
			aria-label={words.closeSource}
		>
			<XIcon size={16} />
		</button>
	</header>

	<div class="ds-lib-pane-body">
		<Markdown content={split.citations.length > 0 ? split.body : rawAnswer} />

		{#if sources.length > 0}
			<div class="ds-lib-pane-sources">
				<SourceList {sources} {words} {oncite} level={3} />
			</div>
		{/if}
	</div>
</aside>

<style>
	.ds-lib-pane {
		position: fixed;
		inset-inline: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		height: 80svh;
		flex-direction: column;
		border-top: 1px solid var(--ds-color-border);
		border-start-start-radius: var(--ds-radius-xl);
		border-start-end-radius: var(--ds-radius-xl);
		background: var(--ds-color-surface-1);
		box-shadow: 0 -12px 40px rgb(0 0 0 / 0.25);
	}

	.ds-lib-pane-grabber {
		display: flex;
		justify-content: center;
		padding-top: 0.5rem;
		padding-bottom: 0.25rem;
	}

	.ds-lib-pane-grabber span {
		width: 2.25rem;
		height: 0.25rem;
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-border);
	}

	.ds-lib-pane-header {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		border-bottom: 1px solid var(--ds-color-border);
		padding: 0.75rem 1rem;
	}

	.ds-lib-pane-heading {
		min-width: 0;
		flex: 1;
	}

	.ds-lib-pane-title,
	.ds-lib-pane-subtitle {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ds-lib-pane-title {
		color: var(--ds-color-foreground);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.ds-lib-pane-subtitle {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-pane-close {
		display: flex;
		width: 2rem;
		height: 2rem;
		flex: none;
		align-items: center;
		justify-content: center;
		margin-top: -0.25rem;
		border: 0;
		border-radius: var(--ds-radius-lg);
		background: none;
		color: var(--ds-color-muted-foreground);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-pane-close:hover {
		background: var(--ds-color-surface-2);
		color: var(--ds-color-foreground);
	}

	.ds-lib-pane-close:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-pane-body {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.75rem 1rem;
	}

	.ds-lib-pane-sources {
		margin-top: 1.5rem;
	}

	@media (min-width: 64rem) {
		.ds-lib-pane {
			position: relative;
			inset: auto;
			height: auto;
			width: 35rem;
			flex: none;
			border-top: 0;
			border-inline-start: 1px solid var(--ds-color-border);
			border-radius: 0;
			box-shadow: none;
		}

		.ds-lib-pane-grabber {
			display: none;
		}
	}
</style>
