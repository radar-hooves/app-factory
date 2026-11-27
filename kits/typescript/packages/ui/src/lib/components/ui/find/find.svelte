<script lang="ts">
	/**
	 * The household's one Find: a search box, filter chips and saved searches, as
	 * one titled section of the page's context column (so it folds like the rest).
	 * Every list page draws it the same way, whatever the list: the page owns the
	 * query, which filters are on and what is saved, and answers the callbacks.
	 * It never takes focus by itself, so on a phone the sheet it opens in shows
	 * the filters and the keyboard comes only when the box is tapped.
	 */
	import Panel from '../panel/panel.svelte';
	import { Input } from '../input/index.js';
	import Button from '../button/button.svelte';
	import Search from '#lib/icons/magnifying-glass.svelte';
	import X from '#lib/icons/x.svelte';
	import { cn } from '#lib/utils.js';
	import type { FindFilter, FindSaved } from './types.js';

	let {
		query = $bindable(''),
		filters = [],
		saved = [],
		title = 'Find',
		placeholder = 'Search',
		onquery,
		onfilter,
		onsave,
		onapply,
		onremove,
		onclear,
		class: className
	}: {
		/** The search text. The page filters its list by it. */
		query?: string;
		filters?: FindFilter[];
		saved?: FindSaved[];
		title?: string;
		placeholder?: string;
		/** The search text changed (the form to use where `query` is not bound, as in ContextColumn's `find`). */
		onquery?: (query: string) => void;
		/** A chip was tapped: turn that filter on or off. */
		onfilter?: (key: string) => void;
		/** Keep the current search (query and filters) under this name; given, "Save this search" shows. */
		onsave?: (name: string) => void;
		onapply?: (id: string) => void;
		onremove?: (id: string) => void;
		/** Clear the query and every filter; given, "Clear" shows while any is set. */
		onclear?: () => void;
		class?: string;
	} = $props();

	const active = $derived(query !== '' || filters.some((f) => f.active));
	let naming = $state(false);
	let name = $state('');

	function save() {
		const label = name.trim();
		if (!label) return;
		onsave?.(label);
		name = '';
		naming = false;
	}
</script>

<Panel {title} class={className} data-slot="find">
	<div class="flex flex-col gap-3">
		<div class="relative">
			<Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
			<Input
				type="search"
				bind:value={query}
				{placeholder}
				aria-label={title}
				oninput={() => onquery?.(query)}
				enterkeyhint="search"
				autocomplete="off"
				class="pl-8"
				data-slot="find-input"
			/>
		</div>

		{#if filters.length}
			<div class="flex flex-wrap gap-1.5" role="group" aria-label="{title} filters">
				{#each filters as f (f.key)}
					<button
						type="button"
						aria-pressed={f.active}
						onclick={() => onfilter?.(f.key)}
						class={cn(
							'focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none pointer-coarse:h-9',
							f.active
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border text-muted-foreground hover:text-foreground'
						)}
						data-slot="find-chip"
					>
						{f.label}
						{#if f.count !== undefined}<span class="tabular-nums opacity-70">{f.count}</span>{/if}
					</button>
				{/each}
			</div>
		{/if}

		{#if onclear && active}
			<Button variant="ghost" size="sm" class="self-start" onclick={onclear} data-slot="find-clear">
				<X /> Clear
			</Button>
		{/if}

		{#if saved.length || onsave}
			<div class="border-border flex flex-col gap-1 border-t pt-3" data-slot="find-saved">
				<span class="ds-label">Saved searches</span>
				{#each saved as s (s.id)}
					<div class="flex items-center gap-1">
						<button
							type="button"
							class="hover:bg-muted focus-visible:ring-ring min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-1 focus-visible:outline-none pointer-coarse:py-2.5"
							onclick={() => onapply?.(s.id)}
						>
							{s.label}
						</button>
						{#if onremove}
							<Button variant="ghost" size="icon-sm" aria-label="Remove {s.label}" onclick={() => onremove?.(s.id)}>
								<X />
							</Button>
						{/if}
					</div>
				{/each}
				{#if onsave && active}
					{#if naming}
						<form
							class="flex items-center gap-1.5"
							onsubmit={(e) => {
								e.preventDefault();
								save();
							}}
						>
							<Input bind:value={name} placeholder="Name this search" aria-label="Name this search" autocomplete="off" />
							<Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
						</form>
					{:else}
						<Button variant="ghost" size="sm" class="self-start" onclick={() => (naming = true)}>
							Save this search
						</Button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</Panel>
