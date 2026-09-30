<script lang="ts">
	// The facet rail beside the catalogue. Selection state belongs to the page
	// (the app re-queries its own backend on change); this only renders the
	// dimensions it is given and hands the next selection back.
	import type { LibraryFacet } from './types.js';

	let {
		facets,
		onChange
	}: {
		facets: LibraryFacet[];
		onChange?: (key: string, selected: string[]) => void;
	} = $props();

	function toggle(facet: LibraryFacet, value: string) {
		const has = facet.selected.includes(value);
		if (facet.multiple) {
			onChange?.(
				facet.key,
				has ? facet.selected.filter((v) => v !== value) : [...facet.selected, value]
			);
		} else {
			onChange?.(facet.key, has ? [] : [value]);
		}
	}
</script>

<div class="space-y-4">
	{#each facets as facet (facet.key)}
		<div>
			<h3 class="text-muted-foreground text-2xs mb-1 font-semibold tracking-wide uppercase">
				{facet.label}
			</h3>
			{#if facet.options.length === 0}
				<p class="text-muted-foreground text-xs">Populates once the catalogue holds documents.</p>
			{:else}
				<ul class="space-y-0.5">
					{#each facet.options as option (option.value)}
						{@const active = facet.selected.includes(option.value)}
						<li>
							<button
								type="button"
								aria-pressed={active}
								class="hover:bg-muted flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-sm {active
									? 'bg-muted font-medium'
									: ''}"
								onclick={() => toggle(facet, option.value)}
							>
								<span class="truncate">{option.label ?? option.value}</span>
								{#if option.count !== undefined}
									<span class="text-muted-foreground font-mono text-xs tabular-nums">
										{option.count}
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/each}
</div>
