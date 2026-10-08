<script lang="ts" generics="P extends { columns: string[]; period?: LedgerPeriod }">
	/**
	 * The viewer's Columns menu: every column the module offers as a tick (the
	 * ledger's running balance one more, always last), then, where the list
	 * groups by a period, the period. An icon button named by its tooltip.
	 * The RecordList's menu is this one without the period.
	 */
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import { Button, buttonVariants } from '../button/index.js';
	import { Checkbox } from '../checkbox/index.js';
	import * as Popover from '../popover/index.js';
	import { Segmented } from '../segmented/index.js';
	import * as Tooltip from '../tooltip/index.js';
	import { cn } from '$lib/utils.js';
	import { LEDGER_PERIODS } from './ledger.js';
	import type { LedgerPeriod } from './types.js';

	let {
		offered,
		preferences,
		note,
		onchange,
		onreset,
		owner = 'ledger'
	}: {
		offered: { key: string; label: string; locked: boolean }[];
		preferences: P;
		note?: string;
		onchange: (next: P) => void;
		onreset: () => void;
		/** The `data-slot` prefix: the list that owns the menu. */
		owner?: string;
	} = $props();

	let open = $state(false);

	const HINT: Record<LedgerPeriod, string> = {
		fy: 'Each financial year sits under its own header, which opens and closes.',
		cy: 'Each calendar year sits under its own header, which opens and closes.',
		month: 'Each month sits under its own header, which opens and closes.',
		week: 'Each week sits under its own header, which opens and closes.',
		day: 'The date heads each day’s rows, so the Date column goes.',
		none: 'One list, newest first, under the column head.'
	};

	function tick(key: string, on: boolean) {
		const next = on ? [...preferences.columns, key] : preferences.columns.filter((k) => k !== key);
		onchange({
			...preferences,
			columns: offered.map((c) => c.key).filter((k) => next.includes(k))
		});
	}

	const eyebrow = 'text-muted-foreground text-2xs tracking-eyebrow font-semibold uppercase';
	/** The ledger's menu also holds its running balance and its grouping. */
	const name = $derived(preferences.period ? 'Columns, balance and grouping' : 'Columns');
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
		<div class="flex flex-col px-2 pt-2.5 pb-2">
			<span class={cn(eyebrow, 'px-1.5 pb-1.5')}>Columns</span>
			{#each offered as c (c.key)}
				{@const on = c.locked || preferences.columns.includes(c.key)}
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
		{#if preferences.period}
			<div class="border-border flex flex-col gap-2 border-t px-3.5 pt-2.5 pb-3">
				<span class={eyebrow}>Group by</span>
				<Segmented
					label="Group by"
					options={LEDGER_PERIODS}
					bind:value={() => preferences.period!, (period) => onchange({ ...preferences, period })}
					class="grid w-full grid-cols-2"
				/>
				<span class="text-muted-foreground text-xs">{HINT[preferences.period]}</span>
			</div>
		{/if}
		<div class="bg-surface-2 border-border flex items-center gap-2 border-t py-2 pr-2 pl-3.5">
			<span class="text-muted-foreground min-w-0 flex-1 text-xs">{note ?? ''}</span>
			<Button variant="ghost" size="sm" onclick={onreset}>Reset</Button>
		</div>
	</Popover.Content>
</Popover.Root>
