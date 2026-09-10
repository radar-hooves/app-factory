<!--
  The cited document, open at the cited passage.

  One element, two shapes. On a desktop it is a real column in the flow at
  about 40% of the width and draggable — the transcript narrows beside it and
  nothing is covered. Below `lg` there is no width to give it, so the same
  element becomes a bottom sheet over the conversation. Two components would
  have meant two behaviours to keep honest; a class list is cheaper than that.
-->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import type { Citation, LoadDocument, LoadedDocument } from '../../citations';
	import Markdown from '../markdown/markdown.svelte';

	interface Props {
		citation: Citation;
		loadDocument: LoadDocument;
		onclose: () => void;
	}

	let { citation, loadDocument, onclose }: Props = $props();

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

<aside
	style="--pane-width: {width}px"
	aria-label="Source document"
	class="bg-surface-1 border-border fixed inset-x-0 bottom-0 z-40 flex h-[80svh] flex-col rounded-t-2xl border-t shadow-2xl lg:static lg:h-auto lg:w-[var(--pane-width)] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -- a pointer-only
	     affordance for a width that has a keyboard-independent default; the
	     pane is fully usable without ever touching it. -->
	<div
		onpointerdown={startDrag}
		onpointermove={drag}
		onpointerup={endDrag}
		class="hover:bg-primary/40 absolute inset-y-0 left-0 hidden w-1.5 cursor-col-resize lg:block"
	></div>

	<!-- The sheet's grabber. Below `lg` this is an overlay a reader has to be
	     able to see the top edge of; on a desktop it is a column, and a column
	     with a handle on it reads as draggable in the wrong axis. -->
	<div class="flex justify-center pt-2 pb-1 lg:hidden" aria-hidden="true">
		<span class="bg-border h-1 w-9 rounded-full"></span>
	</div>

	<header class="border-border flex items-start gap-2 border-b px-4 py-3 lg:pt-3">
		<div class="min-w-0 flex-1">
			<h2 class="text-foreground truncate text-sm font-semibold">
				{document_?.title ?? citation.title}
			</h2>
			{#if citation.section}
				<p class="text-muted-foreground truncate text-xs">{citation.section}</p>
			{/if}
		</div>
		<button
			bind:this={closeButton}
			type="button"
			onclick={onclose}
			aria-label="Close source"
			class="text-muted-foreground hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
		>
			<XIcon class="size-4" />
		</button>
	</header>

	<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
		{#if failed}
			<p class="text-muted-foreground text-sm">That document can't be opened right now.</p>
		{:else if !document_}
			<div class="flex flex-col gap-2" aria-hidden="true">
				{#each [0, 1, 2, 3] as row (row)}
					<div class="bg-muted h-4 animate-pulse rounded" style="width: {90 - row * 12}%"></div>
				{/each}
			</div>
		{:else}
			{#each document_.sections as section (section.anchor)}
				<section
					data-anchor={section.anchor}
					class="scroll-mt-4 rounded-lg px-3 py-2 {section.anchor === activeAnchor
						? 'border-primary/50 bg-primary/8 border-l-2'
						: ''}"
				>
					<h3 class="text-foreground mb-1 text-sm font-semibold">{section.heading}</h3>
					<Markdown content={section.text} dense />
				</section>
			{/each}
		{/if}
	</div>
</aside>
