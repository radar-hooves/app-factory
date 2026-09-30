<script lang="ts">
	/**
	 * CollectionDetail — one collection's surface: its identity (name, meta,
	 * state), an at-a-glance stat list, and the documents it holds.
	 *
	 * Fixed props over plain data (#30): the page fetches, maps its responses
	 * into the shared library vocabulary, and owns the pager offset. Anything
	 * app-specific — a config form, an operations tab, action buttons — comes
	 * in through `actions` (the identity panel's footer) and `children`
	 * (sections rendered after the documents), so the app extends the surface
	 * without forking it.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Button from '../button/button.svelte';
	import DetailPanel from '../detail-panel/detail-panel.svelte';
	import Panel from '../panel/panel.svelte';
	import StatList from '../stat-list/stat-list.svelte';
	import type { StatItem } from '../stat-list/stat-list.svelte';
	import EmptyState from '../empty-state/empty-state.svelte';
	import ErrorState from '../error-state/error-state.svelte';
	import LoadingState from '../loading-state/loading-state.svelte';
	import DocumentTable from '../library-browse/document-table.svelte';
	import type { LibraryCollection, LibraryDocument } from '../library-browse/types.js';

	let {
		collection,
		stats = [],
		documents = [],
		documentsTotal,
		offset = 0,
		limit = 25,
		loading = false,
		error = null,
		documentsLoading = false,
		documentsError = null,
		emptyTitle = 'No documents in this collection yet',
		emptyDescription,
		notFoundTitle = 'Collection not found',
		notFoundDescription,
		onPageChange,
		onRetry,
		documentHref,
		onOpenDocument,
		actions,
		children,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		collection: LibraryCollection | null;
		/** At-a-glance figures for the collection (document count, indexed, …). */
		stats?: StatItem[];
		documents?: LibraryDocument[];
		/** Total documents across all pages; defaults to the rows given. */
		documentsTotal?: number;
		offset?: number;
		limit?: number;
		/** The collection itself is still loading. */
		loading?: boolean;
		error?: string | null;
		/** The document list loads independently of the identity. */
		documentsLoading?: boolean;
		documentsError?: string | null;
		emptyTitle?: string;
		emptyDescription?: string;
		notFoundTitle?: string;
		notFoundDescription?: string;
		onPageChange?: (offset: number) => void;
		onRetry?: () => void;
		documentHref?: (doc: LibraryDocument) => string;
		onOpenDocument?: (doc: LibraryDocument) => void;
		/** App-specific controls, rendered in the identity panel's footer. */
		actions?: Snippet;
		/** App-specific sections rendered after the documents. */
		children?: Snippet;
	} = $props();

	const shownTotal = $derived(documentsTotal ?? documents.length);
	// Floored at 1 so a consumer's limit: 0 cannot put Infinity in the pager.
	const pageSize = $derived(Math.max(1, limit));
	const pageCount = $derived(Math.max(1, Math.ceil(shownTotal / pageSize)));
	const page = $derived(Math.floor(offset / pageSize) + 1);
</script>

<div bind:this={ref} class={cn('flex flex-col gap-4', className)} {...restProps}>
	{#if loading}
		<LoadingState message="Loading the collection…" />
	{:else if error}
		<ErrorState message={error}>
			{#snippet action()}
				{#if onRetry}
					<Button variant="outline" onclick={onRetry}>Retry</Button>
				{/if}
			{/snippet}
		</ErrorState>
	{:else if !collection}
		<EmptyState title={notFoundTitle} description={notFoundDescription} />
	{:else}
		<DetailPanel
			eyebrow="Collection"
			title={collection.name}
			titleFace="display"
			status={collection.badge?.status}
			statusLabel={collection.badge?.label}
			footer={actions}
		>
			{#if collection.subtitle}
				<p class="text-muted-foreground text-sm">{collection.subtitle}</p>
			{/if}
			{#if collection.description}
				<p class="mt-2 max-w-prose text-sm">{collection.description}</p>
			{/if}
			{#if !collection.subtitle && !collection.description}
				<p class="text-muted-foreground text-sm">No description recorded.</p>
			{/if}
		</DetailPanel>

		{#if stats.length > 0}
			<StatList items={stats} />
		{/if}

		{#if documentsLoading}
			<LoadingState message="Loading the documents…" />
		{:else if documentsError}
			<ErrorState message={documentsError}>
				{#snippet action()}
					{#if onRetry}
						<Button variant="outline" onclick={onRetry}>Retry</Button>
					{/if}
				{/snippet}
			</ErrorState>
		{:else if documents.length === 0}
			<EmptyState title={emptyTitle} description={emptyDescription} />
		{:else}
			<Panel title="Documents" subtitle="{shownTotal} document{shownTotal === 1 ? '' : 's'}">
				<div class="flex flex-col gap-3">
					<DocumentTable {documents} {documentHref} onOpen={onOpenDocument} />
					{#if onPageChange && shownTotal > pageSize}
						<div class="flex flex-wrap items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={offset === 0}
								onclick={() => onPageChange(Math.max(0, offset - pageSize))}
							>
								Previous
							</Button>
							<span class="text-muted-foreground text-xs">Page {page} of {pageCount}</span>
							<Button
								variant="outline"
								size="sm"
								disabled={offset + pageSize >= shownTotal}
								onclick={() => onPageChange(offset + pageSize)}
							>
								Next
							</Button>
						</div>
					{/if}
				</div>
			</Panel>
		{/if}

		{#if children}
			{@render children()}
		{/if}
	{/if}
</div>
