<script lang="ts" generics="G extends string">
	/**
	 * The list's Columns menu, the one place a viewer reshapes a list: every
	 * column it offers as a tick, then how its rows group, one choice a row as the ticks above are, so no label truncates or overlaps. A choice is named for what it groups by ("Letter"): the heading says "Group by". The Ledger's groups
	 * are periods (and its running balance one more column, always last); a
	 * RecordList's are the groupings its module offers. Sort is the heads'. An
	 * icon button named by its tooltip.
	 */
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import { Button, buttonVariants } from '../button/index.js';
	import { Checkbox } from '../checkbox/index.js';
	import * as Popover from '../popover/index.js';
	import { RadioGroup } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import * as Tooltip from '../tooltip/index.js';
	import { cn } from '#lib/utils.js';

	let {
		offered,
		columns,
		grouping,
		name,
		note,
		oncolumns,
		onreset,
		owner = 'ledger'
	}: {
		/** The columns to tick; none, and the menu holds only the grouping. */
		offered: { key: string; label: string; locked: boolean }[];
		/** The ticked columns' keys. */
		columns: string[];
		/** How the rows group: the choices, the one in force, and what it does. */
		grouping?: {
			options: readonly { value: G; label: string }[];
			value: G;
			hint?: string;
			onchange: (value: G) => void;
		};
		/** The trigger's tooltip and accessible name. */
		name: string;
		note?: string;
		oncolumns: (columns: string[]) => void;
		onreset: () => void;
		/** The `data-slot` prefix: the list that owns the menu. */
		owner?: string;
	} = $props();

	let open = $state(false);

	function tick(key: string, on: boolean) {
		const next = on ? [...columns, key] : columns.filter((k) => k !== key);
		oncolumns(offered.map((c) => c.key).filter((k) => next.includes(k)));
	}

	const eyebrow = 'text-muted-foreground text-2xs tracking-eyebrow font-semibold uppercase';
	// The heading says "Group by", so a choice that repeats it reads twice.
	$effect(() => {
		if (grouping?.options.some((o) => /^group by\b/i.test(o.label)))
			console.warn(
				'Columns menu: grouping labels sit under a "Group by" heading; name the grouping ("Letter"), not "Group by letter".'
			);
	});
</script>

<Popover.Root bind:open>
	<Tooltip.Provider delayDuration={150}>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Popover.Trigger
						{...props}
						class={buttonVariants({ variant: open ? 'outline' : 'ghost', size: 'icon-sm' })}
						aria-label={name}
						data-slot="{owner}-columns-trigger"
					>
						<Columns3 />
					</Popover.Trigger>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="bottom">{name}</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
	<Popover.Content align="end" class="w-80 p-0" data-slot="{owner}-columns">
		{#if offered.length}
			<div class="flex flex-col px-2 pt-2.5 pb-2">
				<span class={cn(eyebrow, 'px-1.5 pb-1.5')}>Columns</span>
				{#each offered as c (c.key)}
					{@const on = c.locked || columns.includes(c.key)}
					<label
						class={cn(
							'flex min-h-8 items-center gap-2.5 rounded-md px-1.5 text-sm',
							c.locked ? 'text-muted-foreground' : 'hover:bg-accent/50 cursor-pointer'
						)}
					>
						<Checkbox
							checked={on}
							disabled={c.locked}
							onCheckedChange={(v) => tick(c.key, v === true)}
						/>
						<span class="min-w-0 flex-1">{c.label}</span>
						{#if c.locked}<span class="text-xs">Always shown</span>{/if}
					</label>
				{/each}
			</div>
		{/if}
		{#if grouping}
			{@const g = grouping}
			<div
				class={cn('flex flex-col gap-2 px-3.5 pt-2.5 pb-3', offered.length && 'border-border border-t')}
				data-slot="{owner}-grouping"
			>
				<span class={eyebrow}>Group by</span>
				<RadioGroup.Root
					aria-label="Group by"
					class="-mx-1.5 flex flex-col"
					bind:value={() => g.value, (value) => g.onchange(value as G)}
				>
					{#each g.options as o (o.value)}
						<RadioGroup.Item
							value={o.value}
							class="hover:bg-accent/50 data-[state=checked]:text-foreground text-muted-foreground flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-sm break-words data-[state=checked]:font-medium"
						>
							<span class="flex size-4 shrink-0 items-center justify-center">
								{#if g.value === o.value}<Check class="size-4" />{/if}
							</span>
							<span class="min-w-0 flex-1">{o.label}</span>
						</RadioGroup.Item>
					{/each}
				</RadioGroup.Root>
				{#if g.hint}<span class="text-muted-foreground text-xs">{g.hint}</span>{/if}
			</div>
		{/if}
		<div class="bg-surface-2 border-border flex items-center gap-2 border-t py-2 pr-2 pl-3.5">
			<span class="text-muted-foreground min-w-0 flex-1 text-xs">{note ?? ''}</span>
			<Button variant="ghost" size="sm" onclick={onreset}>Reset</Button>
		</div>
	</Popover.Content>
</Popover.Root>
