<script lang="ts">
	/**
	 * DocumentDetail — one document's surface: its identity fields, recorded
	 * locations, tags, and collection memberships.
	 *
	 * Fixed props over plain data (#30). Sections render only when their data
	 * is present, so a consumer whose documents carry no locations never shows
	 * an empty heading. App-specific work — retract/re-extract buttons, an
	 * operations history — comes in through `actions` (the panel's footer) and
	 * `children` (sections after the panel); membership links are the app's
	 * own routed links via `collectionHref`, because this package has no
	 * router.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Button from '../button/button.svelte';
	import { Badge } from '../badge/index.js';
	import DetailPanel from '../detail-panel/detail-panel.svelte';
	import StatusBadge from '../status-badge/status-badge.svelte';
	import EmptyState from '../empty-state/empty-state.svelte';
	import ErrorState from '../error-state/error-state.svelte';
	import LoadingState from '../loading-state/loading-state.svelte';
	import type { LibraryDocumentDetail, LibraryMembership } from '../library-browse/types.js';

	let {
		document,
		loading = false,
		error = null,
		notFoundTitle = 'Document not found',
		notFoundDescription = 'This document is not in the catalogue.',
		collectionHref,
		onOpenCollection,
		onRetry,
		actions,
		children,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		document: LibraryDocumentDetail | null;
		loading?: boolean;
		error?: string | null;
		notFoundTitle?: string;
		notFoundDescription?: string;
		/** The app's own routed link per membership. */
		collectionHref?: (membership: LibraryMembership) => string;
		onOpenCollection?: (membership: LibraryMembership) => void;
		onRetry?: () => void;
		/** App-specific controls, rendered in the panel's footer. */
		actions?: Snippet;
		/** App-specific sections rendered after the panel. */
		children?: Snippet;
	} = $props();
</script>

<div bind:this={ref} class={cn('flex flex-col gap-4', className)} {...restProps}>
	{#if loading}
		<LoadingState message="Loading the document…" />
	{:else if error}
		<ErrorState message={error}>
			{#snippet action()}
				{#if onRetry}
					<Button variant="outline" onclick={onRetry}>Retry</Button>
				{/if}
			{/snippet}
		</ErrorState>
	{:else if !document}
		<EmptyState title={notFoundTitle} description={notFoundDescription} />
	{:else}
		<DetailPanel eyebrow="Document" title={document.title} titleFace="display" footer={actions}>
			<!-- min-w-0 on the grid AND on every cell and value below: a grid or
			     flex item defaults to min-width:auto, so it grows to its widest
			     child and `truncate` can never shrink it. A 64-character content
			     hash and a filesystem path therefore took this card to 1,124px
			     inside a 390px screen and pushed every VALUE off the side, leaving
			     the labels alone on it. -->
			<div class="grid min-w-0 gap-4 sm:grid-cols-2">
				{#if document.fields?.length}
					<div class="min-w-0">
						<h3 class="text-muted-foreground text-2xs mb-2 font-semibold tracking-wide uppercase">
							Details
						</h3>
						<dl class="space-y-1 text-sm">
							{#each document.fields as field (field.label)}
								<div class="flex justify-between gap-4">
									<dt class="text-muted-foreground shrink-0">{field.label}</dt>
									<dd
										class={field.mono
											? 'min-w-0 truncate font-mono text-xs'
											: 'min-w-0 truncate text-right'}
										title={field.value}
									>
										{field.value}
									</dd>
								</div>
							{/each}
						</dl>
					</div>
				{/if}

				{#if document.locations?.length}
					<div class="min-w-0">
						<h3 class="text-muted-foreground text-2xs mb-2 font-semibold tracking-wide uppercase">
							Locations
						</h3>
						<ul class="space-y-1 text-sm">
							{#each document.locations as location (location.path)}
								<li class="flex items-center justify-between gap-2">
									<span class="min-w-0 truncate font-mono text-xs" title={location.path}
										>{location.path}</span
									>
									<div class="flex shrink-0 items-center gap-1">
										{#if location.primary}
											<Badge variant="secondary">primary</Badge>
										{/if}
										{#if location.badge}
											<StatusBadge status={location.badge.status} label={location.badge.label} />
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if document.tags?.length}
					<div class="min-w-0">
						<h3 class="text-muted-foreground text-2xs mb-2 font-semibold tracking-wide uppercase">
							Tags
						</h3>
						<div class="flex flex-wrap gap-1.5">
							{#each document.tags as tag (tag)}
								<Badge variant="outline">{tag}</Badge>
							{/each}
						</div>
					</div>
				{/if}

				{#if document.memberships?.length}
					<div class="min-w-0">
						<h3 class="text-muted-foreground text-2xs mb-2 font-semibold tracking-wide uppercase">
							Collections
						</h3>
						<div class="flex flex-wrap gap-1.5">
							{#each document.memberships as membership (membership.id)}
								{#if collectionHref}
									<a
										href={collectionHref(membership)}
										class="inline-flex items-center gap-1"
										onclick={() => onOpenCollection?.(membership)}
									>
										<Badge variant="outline">{membership.name}</Badge>
										{#if membership.badge}
											<StatusBadge
												status={membership.badge.status}
												label={membership.badge.label}
											/>
										{/if}
									</a>
								{:else if onOpenCollection}
									<button
										type="button"
										class="inline-flex items-center gap-1"
										onclick={() => onOpenCollection(membership)}
									>
										<Badge variant="outline">{membership.name}</Badge>
										{#if membership.badge}
											<StatusBadge
												status={membership.badge.status}
												label={membership.badge.label}
											/>
										{/if}
									</button>
								{:else}
									<span class="inline-flex items-center gap-1">
										<Badge variant="outline">{membership.name}</Badge>
										{#if membership.badge}
											<StatusBadge
												status={membership.badge.status}
												label={membership.badge.label}
											/>
										{/if}
									</span>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</DetailPanel>

		{#if children}
			{@render children()}
		{/if}
	{/if}
</div>
