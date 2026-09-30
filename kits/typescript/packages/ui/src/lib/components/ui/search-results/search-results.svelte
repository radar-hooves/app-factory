<script lang="ts">
	/**
	 * SearchResults — a ranked retrieval answer: for each hit, the document's
	 * title, the passage that matched (with the matching spans emphasised), a
	 * source chip, consumer-mapped state, and a relevance figure.
	 *
	 * Designed, not extracted (#30): no in-repo view existed to generalise
	 * from. The shape follows the documentation-search results pattern — title
	 * over highlighted snippet over source — rendered in this package's own
	 * vocabulary: the highlight is a tint of the app's accent so every
	 * consumer's results wear its own palette; the score is a mono, tabular
	 * figure per the machine-value rule; state chips are StatusBadge.
	 *
	 * Fixed props over plain data: the page owns the query and the fetch, and
	 * this only renders the answer. `<ol>` because rank IS the meaning.
	 */
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Button from '../button/button.svelte';
	import StatusBadge from '../status-badge/status-badge.svelte';
	import EmptyState from '../empty-state/empty-state.svelte';
	import ErrorState from '../error-state/error-state.svelte';
	import LoadingState from '../loading-state/loading-state.svelte';
	import type { LibrarySearchResult, SearchSnippetSegment } from '../library-browse/types.js';

	let {
		results,
		query = '',
		total,
		loading = false,
		error = null,
		promptTitle = 'Search the catalogue',
		promptDescription = 'Results appear here as you search.',
		noResultsTitle,
		noResultsDescription = 'Try a broader term, or search a different collection.',
		resultHref,
		onOpen,
		onRetry,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<Omit<HTMLAttributes<HTMLDivElement>, 'results'>> & {
		/** `Omit` above: svelte/elements declares a legacy `results` HTML
		 *  attribute (number) on every element, and without the omission this
		 *  prop's type silently intersects with it — callers then cannot pass
		 *  an array at all. Caught by CI's svelte-check on the test call sites. */
		results: LibrarySearchResult[];
		/** The term the page searched for; shown in the count line and empty copy. */
		query?: string;
		/** Total hits when the page truncates; defaults to the rows given. */
		total?: number;
		loading?: boolean;
		error?: string | null;
		/** Copy for the surface before any search has been made. */
		promptTitle?: string;
		promptDescription?: string;
		/** Copy when a search matched nothing; defaults name the query. */
		noResultsTitle?: string;
		noResultsDescription?: string;
		/** The app's own routed link per hit; this package has no router. */
		resultHref?: (result: LibrarySearchResult) => string;
		onOpen?: (result: LibrarySearchResult) => void;
		onRetry?: () => void;
	} = $props();

	const shownTotal = $derived(total ?? results.length);

	/** Normalise a snippet: plain text becomes one unhighlighted segment. */
	function segments(snippet: string | SearchSnippetSegment[]): SearchSnippetSegment[] {
		return typeof snippet === 'string' ? [{ text: snippet }] : snippet;
	}

	/** Relevance as a whole percentage; the wire value is [0, 1]. */
	function pct(score: number): number {
		return Math.round(Math.min(1, Math.max(0, score)) * 100);
	}
</script>

<div bind:this={ref} class={cn('flex flex-col gap-3', className)} {...restProps}>
	{#if loading}
		<LoadingState message="Searching…" />
	{:else if error}
		<ErrorState message={error}>
			{#snippet action()}
				{#if onRetry}
					<Button variant="outline" onclick={onRetry}>Retry</Button>
				{/if}
			{/snippet}
		</ErrorState>
	{:else if results.length === 0}
		{#if query}
			<EmptyState
				icon={SearchIcon}
				title={noResultsTitle ?? `No results for “${query}”`}
				description={noResultsDescription}
			/>
		{:else}
			<EmptyState icon={SearchIcon} title={promptTitle} description={promptDescription} />
		{/if}
	{:else}
		<p class="text-muted-foreground text-sm">
			<span class="font-mono tabular-nums">{shownTotal}</span>
			result{shownTotal === 1 ? '' : 's'}{query ? ` for “${query}”` : ''}
		</p>

		<ol class="divide-border border-border ds-edge bg-card divide-y rounded-lg border">
			{#each results as result (result.id)}
				<li>
					<article class="flex items-start gap-4 px-4 py-3.5">
						<div class="min-w-0 flex-1">
							{#if resultHref}
								<a
									href={resultHref(result)}
									class="font-medium hover:underline"
									onclick={() => onOpen?.(result)}
								>
									{result.title}
								</a>
							{:else if onOpen}
								<button
									type="button"
									class="text-left font-medium hover:underline"
									onclick={() => onOpen(result)}
								>
									{result.title}
								</button>
							{:else}
								<span class="font-medium">{result.title}</span>
							{/if}

							{#if result.source || result.meta}
								<div class="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
									{#if result.source}
										<span class="bg-surface-2 rounded px-1.5 py-0.5 font-medium">
											{result.source}
										</span>
									{/if}
									{#if result.meta}
										<span>{result.meta}</span>
									{/if}
								</div>
							{/if}

							{#if result.snippet}
								<!-- The matched passage. <mark> carries the semantics; the UA's
								     black-on-yellow default is replaced with a tint of the
								     app's own accent, so the highlight is skinned by the
								     consumer's palette like everything else. -->
								<p class="text-muted-foreground mt-1.5 line-clamp-3 text-sm">
									{#each segments(result.snippet) as segment, i (i)}
										{#if segment.highlight}
											<mark class="bg-primary/15 text-foreground rounded-sm px-0.5 font-medium">
												{segment.text}
											</mark>
										{:else}
											{segment.text}
										{/if}
									{/each}
								</p>
							{/if}

							{#if result.badges?.length}
								<div class="mt-1.5 flex flex-wrap gap-1">
									<!-- Keyed by index: LibraryBadge carries no id, and two states
									     can legitimately share a label. -->
									{#each result.badges as badge, i (i)}
										<StatusBadge status={badge.status} label={badge.label} />
									{/each}
								</div>
							{/if}
						</div>

						{#if result.score !== undefined}
							<span
								class="text-muted-foreground mt-0.5 flex-none font-mono text-xs tabular-nums"
								aria-label="Relevance {pct(result.score)} percent"
							>
								{pct(result.score)}%
							</span>
						{/if}
					</article>
				</li>
			{/each}
		</ol>
	{/if}
</div>
