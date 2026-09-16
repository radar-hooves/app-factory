<!--
  The cited document, open at the cited passage.

  One element, two shapes. On a desktop it is a real column in the flow at
  about 40% of the width and draggable — the transcript narrows beside it and
  nothing is covered. Under 64rem there is no width to give it, so the same
  element becomes a bottom sheet over the conversation. Two components would
  have meant two behaviours to keep honest; one media query is cheaper.
-->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { trustMark, type Citation, type LoadDocument, type LoadedDocument } from '../../citations';
	import { resolveCopy, type LibrarianCopy } from '../../copy';
	import Markdown from '../markdown/markdown.svelte';

	interface Props {
		citation: Citation;
		loadDocument: LoadDocument;
		onclose: () => void;
		copy?: Partial<LibrarianCopy>;
	}

	let { citation, loadDocument, onclose, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));
	// The same mark the chip carried, repeated where the reader has the
	// document open in front of them: this is the moment they decide whether
	// to act on it, and a currency they had to remember from a chip two
	// scrolls up is one they will not have.
	const mark = $derived(trustMark(citation, words));

	const MIN_WIDTH = 320;
	/** ~40% of a 1440 desktop, which is the width the pane is designed at. */
	const DEFAULT_WIDTH = 560;

	let width = $state(DEFAULT_WIDTH);
	let document_ = $state<LoadedDocument | null>(null);
	let failed = $state(false);
	let scroller = $state<HTMLElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);

	// Keyed on the id, so re-citing the same document while the pane is open
	// moves to the new section without a second fetch and without a flash of
	// the loading state.
	// Plain, not `$state`: the effect below both reads and writes it, and
	// nothing renders it.
	let loadedId: string | null = null;

	$effect(() => {
		const id = citation.document_id;
		if (!id || id === loadedId) return;
		let cancelled = false;
		document_ = null;
		failed = false;
		loadDocument(id)
			.then((doc) => {
				if (cancelled) return;
				document_ = doc;
				loadedId = id;
			})
			.catch(() => {
				if (!cancelled) failed = true;
			});
		return () => {
			cancelled = true;
		};
	});

	// The anchor is the citation's own address; the section heading is the
	// fallback for a citation that carries only prose-derived words.
	const activeAnchor = $derived.by(() => {
		const sections = document_?.sections ?? [];
		if (citation.anchor && sections.some((s) => s.anchor === citation.anchor))
			return citation.anchor;
		return sections.find((s) => s.heading === citation.section)?.anchor ?? sections[0]?.anchor ?? '';
	});

	$effect(() => {
		if (!scroller || !activeAnchor) return;
		const target = scroller.querySelector(`[data-anchor="${CSS.escape(activeAnchor)}"]`);
		target?.scrollIntoView({ block: 'center' });
	});

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

	let dragFrom: { x: number; width: number } | null = null;

	function startDrag(event: PointerEvent) {
		dragFrom = { x: event.clientX, width };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function drag(event: PointerEvent) {
		if (!dragFrom) return;
		// The handle is on the pane's LEFT edge, so dragging left widens it.
		const next = dragFrom.width - (event.clientX - dragFrom.x);
		width = Math.max(MIN_WIDTH, Math.min(next, window.innerWidth * 0.7));
	}

	function endDrag(event: PointerEvent) {
		dragFrom = null;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}
</script>

<svelte:window onkeydown={keydown} />

<aside style="--ds-lib-pane-width: {width}px" aria-label="Source document" class="ds-lib-pane">
	<!-- The drag handle. The pane being `position: relative` at 64rem, not
	     `static`, is what this depends on: an absolutely-positioned child needs
	     a positioned ancestor, and without one the handle lands somewhere else
	     entirely and the pane is silently not resizable. Measured — the drag
	     moved nothing. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -- a pointer-only
	     affordance for a width that has a keyboard-independent default; the
	     pane is fully usable without ever touching it. -->
	<div
		class="ds-lib-pane-handle"
		onpointerdown={startDrag}
		onpointermove={drag}
		onpointerup={endDrag}
	></div>

	<!-- The sheet's grabber. On a phone this is an overlay a reader has to be
	     able to see the top edge of; on a desktop it is a column, and a column
	     with a handle on it reads as draggable in the wrong axis. -->
	<div class="ds-lib-pane-grabber" aria-hidden="true"><span></span></div>

	<header class="ds-lib-pane-header">
		<div class="ds-lib-pane-heading">
			<h2 class="ds-lib-pane-title">{document_?.title ?? citation.title}</h2>
			{#if citation.section}
				<p class="ds-lib-pane-subtitle">{citation.section}</p>
			{/if}
			{#if mark}
				<p class="ds-lib-pane-mark">{mark}</p>
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

	<div bind:this={scroller} class="ds-lib-pane-body">
		{#if failed}
			<p class="ds-lib-pane-failed">{words.documentUnavailable}</p>
		{:else if !document_}
			<div class="ds-lib-pane-skeleton" aria-hidden="true">
				{#each [0, 1, 2, 3] as row (row)}
					<div class="ds-lib-pane-bar" style="width: {90 - row * 12}%"></div>
				{/each}
			</div>
		{:else}
			{#each document_.sections as section (section.anchor)}
				<section
					data-anchor={section.anchor}
					class="ds-lib-pane-section"
					class:is-cited={section.anchor === activeAnchor}
				>
					<h3 class="ds-lib-pane-section-heading">{section.heading}</h3>
					<Markdown content={section.text} dense />
				</section>
			{/each}
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

	.ds-lib-pane-handle {
		display: none;
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

	.ds-lib-pane-mark {
		margin: 0;
		color: color-mix(in oklab, var(--ds-color-muted-foreground) 80%, transparent);
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

	.ds-lib-pane-failed {
		margin: 0;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
	}

	.ds-lib-pane-skeleton {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ds-lib-pane-bar {
		height: 1rem;
		border-radius: var(--ds-radius-md);
		background: var(--ds-color-surface-2);
		animation: ds-lib-pane-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.ds-lib-pane-section {
		scroll-margin-top: 1rem;
		border-radius: var(--ds-radius-lg);
		padding: 0.5rem 0.75rem;
	}

	.ds-lib-pane-section.is-cited {
		border-inline-start: 2px solid color-mix(in oklab, var(--ds-color-primary) 50%, transparent);
		background: color-mix(in oklab, var(--ds-color-primary) 8%, transparent);
	}

	.ds-lib-pane-section-heading {
		margin: 0 0 0.25rem;
		color: var(--ds-color-foreground);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 600;
	}

	@keyframes ds-lib-pane-pulse {
		50% {
			opacity: 0.4;
		}
	}

	@media (min-width: 64rem) {
		.ds-lib-pane {
			position: relative;
			inset: auto;
			height: auto;
			width: var(--ds-lib-pane-width);
			flex: none;
			border-top: 0;
			border-inline-start: 1px solid var(--ds-color-border);
			border-radius: 0;
			box-shadow: none;
		}

		.ds-lib-pane-handle {
			position: absolute;
			inset-block: 0;
			inset-inline-start: 0;
			display: block;
			width: 0.375rem;
			cursor: col-resize;
		}

		.ds-lib-pane-handle:hover {
			background: color-mix(in oklab, var(--ds-color-primary) 40%, transparent);
		}

		.ds-lib-pane-grabber {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-pane-bar {
			animation: none;
		}
	}
</style>
