<script lang="ts">
	/**
	 * One document beside what it belongs to: titled, closable, its page
	 * fitted to the pane, with paging and zoom. The record page's third pane
	 * (ContextColumn's `document`), the ledger's document, the Fat
	 * Controller's page. It fills the height it is given.
	 *
	 * The pages are image URLs, one a page; or draw them yourself through
	 * `page` with `pageCount`, as PageCanvas takes them (a PDF canvas).
	 *
	 *     <DocumentPane title="Residential tenancy agreement"
	 *       subtitle="House · 19 Jul 2025 to 18 Jan 2026" pages={leasePages}
	 *       actions={[{ label: 'Download', icon: Download, href: leaseUrl, download: true }]}
	 *       onClose={() => (lease = null)} />
	 */
	import { untrack, type Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import X from '@lucide/svelte/icons/x';
	import Panel from '../panel/panel.svelte';
	import PageCanvas from '../page-canvas/page-canvas.svelte';
	import type { PageCanvasRenderInfo } from '../page-canvas/types.js';
	import * as Tooltip from '../tooltip/index.js';
	import IconAction from '../list-toolbar/icon-action.svelte';
	import type { ListIconAction } from '../list-toolbar/types.js';
	import { cn } from '$lib/utils.js';

	let {
		title,
		subtitle,
		pages,
		pageCount,
		page,
		currentPage = $bindable(1),
		zoom = $bindable(1),
		actions = [],
		onClose,
		class: className
	}: {
		title: string;
		/** One line under the title: what the document is of, and when. */
		subtitle?: string;
		/** 1-based. */
		currentPage?: number;
		zoom?: number;
		/** Icon actions in the header, each named by its tooltip: download, open in a tab. */
		actions?: ListIconAction[];
		/** Shows a close button, last in the header. */
		onClose?: () => void;
		class?: string;
	} & (
		| {
				/** One image URL a page. */
				pages: readonly string[];
				pageCount?: never;
				page?: never;
		  }
		| {
				pages?: never;
				pageCount: number;
				/** Draws one page at the size it is handed, and reports its own size once known. */
				page: Snippet<[pageNumber: number, info: PageCanvasRenderInfo]>;
		  }
	) = $props();

	const count = $derived(pages ? pages.length : (pageCount ?? 0));
	/** Pages whose image did not load. */
	const failed = new SvelteSet<number>();
	/**
	 * Which document this is. Another one opens on its first page, fitted, with
	 * nothing failed: the pane is kept when the page swaps the document in it.
	 */
	const identity = $derived(pages ? pages.join('\n') : `${title}\n${pageCount}`);
	let opened = untrack(() => identity);
	$effect.pre(() => {
		if (identity === opened) return;
		opened = identity;
		currentPage = 1;
		zoom = 1;
		failed.clear();
	});
</script>

{#snippet image(n: number, info: PageCanvasRenderInfo)}
	{#if failed.has(n)}
		<div
			class="bg-card border-border text-muted-foreground grid size-full place-items-center rounded-sm border p-4 text-center text-sm"
		>
			Page {n} could not be loaded
		</div>
	{:else}
		<img
			src={pages![n - 1]}
			alt="{title}, page {n} of {count}"
			class="border-border block size-full rounded-sm border object-contain"
			onload={(e) => {
				const img = e.currentTarget as HTMLImageElement;
				info.reportSize(img.naturalWidth, img.naturalHeight);
			}}
			onerror={() => {
				failed.add(n);
				// A page's place keeps A4's proportions, so the pane still pages past it.
				info.reportSize(210, 297);
			}}
		/>
	{/if}
{/snippet}

{#snippet header()}
	<Tooltip.Provider delayDuration={150}>
		{#each actions as a (a.label)}<IconAction action={a} />{/each}
		{#if onClose}
			<IconAction action={{ label: `Close ${title}`, icon: X, onclick: onClose }} />
		{/if}
	</Tooltip.Provider>
{/snippet}

<Panel
	{title}
	{subtitle}
	action={actions.length || onClose ? header : undefined}
	pad={false}
	scroll
	class={cn('h-full min-h-0', className)}
	aria-label={title}
	data-slot="document-pane"
>
	{#key identity}
		<PageCanvas
			pageCount={count}
			page={pages ? image : page!}
			bind:currentPage
			bind:zoom
			class="bg-surface-2 h-full"
		/>
	{/key}
</Panel>
