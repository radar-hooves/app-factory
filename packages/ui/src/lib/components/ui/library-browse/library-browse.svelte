<script lang="ts">
	/**
	 * LibraryBrowse — the faceted catalogue index: search, facet rail, active
	 * filter chips, the document table, and a pager.
	 *
	 * Fixed props over plain data, deliberately — library data is stable in
	 * shape, so it gets a fixed component; configuration is the schema-driven
	 * half and lives in <SchemaForm> (#30). The component fetches nothing and
	 * routes nothing: the page owns the query, the facet selections and the
	 * offset, re-queries its own backend on every callback, and supplies its
	 * own routed link per row via `documentHref`.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Search from '@lucide/svelte/icons/search';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import X from '@lucide/svelte/icons/x';
	import { Input } from '../input/index.js';
	import Button from '../button/button.svelte';
	import { Badge } from '../badge/index.js';
	import EmptyState from '../empty-state/empty-state.svelte';
	import ErrorState from '../error-state/error-state.svelte';
	import LoadingState from '../loading-state/loading-state.svelte';
	import DocumentTable from './document-table.svelte';
	import FacetRail from './facet-rail.svelte';
	import type { LibraryDocument, LibraryFacet } from './types.js';

	let {
		documents,
		facets = [],
		query = '',
		total,
		offset = 0,
		limit = 25,
		loading = false,
		error = null,
		searchPlaceholder = 'Search the catalogue…',
		emptyTitle = 'The catalogue is empty',
		emptyDescription,
		onQueryChange,
		onFacetChange,
		onPageChange,
		onRetry,
		documentHref,
		onOpenDocument,
		toolbar,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		documents: LibraryDocument[];
		facets?: LibraryFacet[];
		/** The current search term. The page owns it; typing fires `onQueryChange`. */
		query?: string;
		/** Total matches across all pages; defaults to the rows given. */
		total?: number;
		offset?: number;
		limit?: number;
		loading?: boolean;
		error?: string | null;
		searchPlaceholder?: string;
		/** Copy for a catalogue that is genuinely empty (no filter active). */
		emptyTitle?: string;
		emptyDescription?: string;
		onQueryChange?: (query: string) => void;
		onFacetChange?: (key: string, selected: string[]) => void;
		/** Called with the next offset when the pager is used. */
		onPageChange?: (offset: number) => void;
		onRetry?: () => void;
		/** The app's own routed link per row; this package has no router. */
		documentHref?: (doc: LibraryDocument) => string;
		onOpenDocument?: (doc: LibraryDocument) => void;
		/** Trailing controls beside the search field (e.g. a saved-search menu). */
		toolbar?: Snippet;
	} = $props();

	interface Chip {
		key: string;
		label: string;
		remove: () => void;
	}

	// Chips are derived, never state: the page owns query and selections, so a
	// chip's removal is just the matching callback with the value taken out.
	const chips = $derived.by((): Chip[] => {
		const out: Chip[] = [];
		if (query) out.push({ key: 'q', label: `“${query}”`, remove: () => onQueryChange?.('') });
		for (const facet of facets) {
			for (const value of facet.selected) {
				out.push({
					key: `${facet.key}:${value}`,
					label: `${facet.label.toLowerCase()}: ${value}`,
					remove: () =>
						onFacetChange?.(
							facet.key,
							facet.selected.filter((v) => v !== value)
						)
				});
			}
		}
		return out;
	});
	const filtered = $derived(chips.length > 0);

	function clearAll() {
		if (query) onQueryChange?.('');
		for (const facet of facets) {
			if (facet.selected.length) onFacetChange?.(facet.key, []);
		}
	}

	/**
	 * Whether the facet rail is revealed below `md`. The only state this
	 * component owns, and deliberately so: it is a disclosure, not a filter.
	 * The rail used to be `hidden md:block` with nothing to reveal it, so on a
	 * phone the whole of filtering was simply absent — no drawer, no
	 * disclosure, no way to reach it at all.
	 */
	let facetsOpen = $state(false);

	const shownTotal = $derived(total ?? documents.length);
	// Floored at 1 so a consumer's limit: 0 cannot put Infinity in the pager.
	const pageSize = $derived(Math.max(1, limit));
	const pageCount = $derived(Math.max(1, Math.ceil(shownTotal / pageSize)));
	const page = $derived(Math.floor(offset / pageSize) + 1);
</script>

<div bind:this={ref} class={cn('flex flex-col gap-4', className)} {...restProps}>
	<div class="flex flex-wrap items-center gap-2">
		<form
			class="relative w-full flex-none sm:w-80"
			onsubmit={(e) => {
				e.preventDefault();
				onQueryChange?.(query);
			}}
		>
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
			/>
			<Input
				type="search"
				value={query}
				placeholder={searchPlaceholder}
				class="pl-8"
				oninput={(e) => onQueryChange?.((e.target as HTMLInputElement).value)}
			/>
		</form>
		{#if toolbar}
			<div class="flex items-center gap-2">{@render toolbar()}</div>
		{/if}
	</div>

	{#if chips.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			{#each chips as chip (chip.key)}
				<Badge variant="secondary" class="gap-1">
					{chip.label}
					<button
						type="button"
						aria-label="Remove filter {chip.label}"
						class="hover:opacity-70"
						onclick={chip.remove}
					>
						<X class="size-3" />
					</button>
				</Badge>
			{/each}
			<Button variant="ghost" size="sm" onclick={clearAll}>Clear all</Button>
		</div>
	{/if}

	{#if facets.length > 0}
		<Button
			variant="outline"
			size="sm"
			class="w-fit md:hidden"
			aria-expanded={facetsOpen}
			onclick={() => (facetsOpen = !facetsOpen)}
		>
			<SlidersHorizontal class="size-4" />
			{facetsOpen ? 'Hide filters' : 'Filters'}
		</Button>
	{/if}

	<div
		class={facets.length > 0 ? 'grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]' : 'grid gap-6'}
	>
		{#if facets.length > 0}
			<aside class={facetsOpen ? 'block' : 'hidden md:block'} aria-label="Filters">
				<FacetRail {facets} onChange={onFacetChange} />
			</aside>
		{/if}

		<!-- min-w-0: a grid item defaults to min-width:auto, so without it this
		     column stretches to the table's intrinsic width and the table's own
		     scroller never gets a bounded box — the excess lands on the shell's
		     scroller instead (measured in the first consumer). minmax(0,1fr) on
		     the track carries the same guarantee at the grid level. -->
		<div class="flex min-w-0 flex-col gap-3">
			{#if loading}
				<LoadingState message="Loading the catalogue…" />
			{:else if error}
				<ErrorState message={error}>
					{#snippet action()}
						{#if onRetry}
							<Button variant="outline" onclick={onRetry}>Retry</Button>
						{/if}
					{/snippet}
				</ErrorState>
			{:else if documents.length === 0}
				{#if filtered}
					<EmptyState
						icon={LibraryIcon}
						title="No documents match this search"
						description="Try a different term, or clear the filters to see the whole catalogue."
					>
						{#snippet action()}
							<Button variant="outline" onclick={clearAll}>Clear filters</Button>
						{/snippet}
					</EmptyState>
				{:else}
					<EmptyState icon={LibraryIcon} title={emptyTitle} description={emptyDescription} />
				{/if}
			{:else}
				<DocumentTable {documents} {documentHref} onOpen={onOpenDocument} />

				<div class="flex flex-wrap items-center justify-between gap-2">
					<p class="text-muted-foreground text-xs">
						{shownTotal} document{shownTotal === 1 ? '' : 's'}
					</p>
					{#if onPageChange && shownTotal > pageSize}
						<div class="flex items-center gap-2">
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
			{/if}
		</div>
	</div>
</div>
