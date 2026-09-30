<script lang="ts">
	// The one catalogue table, shared by LibraryBrowse and CollectionDetail so
	// the two surfaces cannot drift apart. Columns come and go with the data —
	// a consumer that passes no `collections` never sees an empty column —
	// which is what lets one table serve both the whole-catalogue view and a
	// single collection's slice.
	//
	// Columns also come and go with the VIEWPORT. The title is the only column
	// a phone has room for, so the secondary ones drop by breakpoint rather
	// than pushing the table into its own horizontal scroller — measured on a
	// real catalogue at 390px, where four columns of full-length titles, tag
	// lists and collection lists took the table to 1,612px and every row
	// scrolled sideways.
	import {
		Table as TableRoot,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '../table/index.js';
	import StatusBadge from '../status-badge/status-badge.svelte';
	import type { LibraryDocument } from './types.js';

	let {
		documents,
		documentHref,
		onOpen
	}: {
		documents: LibraryDocument[];
		/** The app's own routed link per row; this package has no router of its own. */
		documentHref?: (doc: LibraryDocument) => string;
		onOpen?: (doc: LibraryDocument) => void;
	} = $props();

	const hasTags = $derived(documents.some((d) => d.tags?.length));
	const hasCollections = $derived(documents.some((d) => d.collections?.length));
	const hasBadges = $derived(documents.some((d) => d.badges?.length));
</script>

<!-- The card surface, not a bare border. This wrapper holds CONTENT, so it has
     to paint one: with `border` alone the table and every ancestor computed
     rgba(0,0,0,0) at 1440x900 in both themes, so the page background showed
     straight through a container sitting beside opaque cards. `bg-card
     border-border ds-edge` is the same trio Panel, StatCard, StatList,
     DetailPanel, EmptyState and DataTableTanstack use — and `border-border`
     matters on its own: a bare `border` resolves to currentColor, which was
     drawing this hairline in full-strength foreground rather than the border
     token. `overflow-hidden` comes with the surface, as it does on every
     sibling: a row's `hover:bg-muted/50` otherwise paints square corners over
     the wrapper's radius now that there is a surface to paint over.
     Gated by src/test/bordered-surface.test.ts. -->
<div class="bg-card border-border ds-edge overflow-hidden rounded-md border">
	<TableRoot>
		<TableHeader>
			<TableRow>
				<TableHead>Title</TableHead>
				{#if hasTags}
					<TableHead class="hidden w-40 xl:table-cell">Tags</TableHead>
				{/if}
				{#if hasCollections}
					<TableHead class="hidden w-40 lg:table-cell">Collections</TableHead>
				{/if}
				{#if hasBadges}
					<TableHead class="w-40 text-center">Status</TableHead>
				{/if}
			</TableRow>
		</TableHeader>
		<TableBody>
			{#each documents as doc (doc.id)}
				<TableRow>
					<!-- max-w-0 + truncate, together: TableCell sets whitespace-nowrap, so
					     without a width bound this column stretches the table to its widest
					     title, and with a bound but no truncate the text overflows UNDER the
					     next cell — which then swallows the link's clicks. -->
					<TableCell class="max-w-0">
						{#if documentHref}
							<a
								href={documentHref(doc)}
								title={doc.title}
								class="block truncate font-medium hover:underline"
								onclick={() => onOpen?.(doc)}
							>
								{doc.title}
							</a>
						{:else if onOpen}
							<button
								type="button"
								title={doc.title}
								class="block w-full truncate text-left font-medium hover:underline"
								onclick={() => onOpen(doc)}
							>
								{doc.title}
							</button>
						{:else}
							<span class="block truncate font-medium" title={doc.title}>{doc.title}</span>
						{/if}
					</TableCell>
					{#if hasTags}
						<TableCell
							class="text-muted-foreground hidden max-w-40 truncate text-xs xl:table-cell"
							title={doc.tags?.join(', ')}
						>
							{doc.tags?.join(', ') || '—'}
						</TableCell>
					{/if}
					{#if hasCollections}
						<TableCell
							class="text-muted-foreground hidden max-w-40 truncate text-xs lg:table-cell"
							title={doc.collections?.join(', ')}
						>
							{doc.collections?.join(', ') || '—'}
						</TableCell>
					{/if}
					{#if hasBadges}
						<TableCell class="text-center">
							<div class="flex flex-wrap justify-center gap-1">
								<!-- Keyed by index: LibraryBadge carries no id, and two memberships
								     can legitimately map to the same label+status. -->
								{#each doc.badges ?? [] as badge, i (i)}
									<StatusBadge status={badge.status} label={badge.label} />
								{:else}
									<span class="text-muted-foreground text-xs">—</span>
								{/each}
							</div>
						</TableCell>
					{/if}
				</TableRow>
			{/each}
		</TableBody>
	</TableRoot>
</div>
