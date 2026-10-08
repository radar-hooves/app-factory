<script lang="ts">
	/**
	 * The open record's whole name as the top bar's control: a raised button
	 * with its chevron inside, after the section's name. Its menu finds a
	 * record by name, lists them under their headings (owned, then sold) with
	 * a thumbnail each, and ends with the way to all of them, so it still
	 * works at fifty. The record's own pages follow as tabs.
	 *
	 * It places nothing itself: put it inside `ShellControls` with whatever
	 * else the page sets in the bar.
	 *
	 *     <ShellControls>
	 *       <RecordSwitcher name="4. Banksia" current={4} groups={[owned, sold]}
	 *         noun="property" icon={House} all={{ label: 'All properties', href: '/property' }}
	 *         pages={[{ label: 'Overview', href: '/property/4', current: true }, …]} />
	 *     </ShellControls>
	 */
	import { Command as CommandPrimitive, computeCommandScore } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { buttonVariants } from '../button/index.js';
	import * as Command from '../command/index.js';
	import * as Popover from '../popover/index.js';
	import type { IconComponent } from '../app-shell/types.js';
	import Thumbnail from '../record-list/thumbnail.svelte';
	import { cn } from '$lib/utils.js';
	import type { RecordPage, RecordSwitcherGroup, RecordSwitcherItem } from './types.js';

	let {
		name,
		current,
		groups,
		noun = 'record',
		placeholder = `Find a ${noun}`,
		icon,
		all,
		pages = [],
		separator = true,
		open = $bindable(false),
		class: className
	}: {
		/** The open record's whole name. */
		name: string;
		/** The open record's id, ticked in the menu. */
		current?: string | number;
		groups: readonly RecordSwitcherGroup[];
		/** What a record is, for the control's name and the search's prompt. */
		noun?: string;
		placeholder?: string;
		/** The tile a record without a photo shows. With it every record has a thumbnail. */
		icon?: IconComponent;
		/** The menu's last line: every record, on its list. */
		all?: { label: string; href: string };
		/** The open record's own pages, as tabs after its name. */
		pages?: readonly RecordPage[];
		/** The "/" after the section's name. Off where it is not in the bar. */
		separator?: boolean;
		open?: boolean;
		class?: string;
	} = $props();

	const thumbs = $derived(!!icon || groups.some((g) => g.items.some((i) => i.image)));
	/** An item's key in the menu; the search reads its name and note, never this. */
	const valueOf = (item: RecordSwitcherItem) => `record:${item.id}`;
	const words = $derived(
		new Map(groups.flatMap((g) => g.items).map((i) => [valueOf(i), `${i.label} ${i.note ?? ''}`]))
	);
	const filter = (value: string, search: string) =>
		computeCommandScore(words.get(value) ?? value, search);
	const here = () => {
		const item = groups.flatMap((g) => g.items).find((i) => i.id === current);
		return item ? valueOf(item) : '';
	};
	/**
	 * The highlighted record: the open one, set as the menu opens, before the
	 * list mounts, or the list would start on its first row.
	 */
	// svelte-ignore state_referenced_locally
	let highlighted = $state(here());
	const eyebrow = 'text-muted-foreground text-2xs tracking-eyebrow font-semibold uppercase';
</script>

<div class={cn('flex min-w-0 items-center gap-2 sm:gap-3', className)} data-slot="record-switcher">
	{#if separator}<span class="text-shell-muted-foreground flex-none" aria-hidden="true">/</span>{/if}
	<Popover.Root bind:open onOpenChange={(o) => o && (highlighted = here())}>
		<Popover.Trigger
			class={cn(
				buttonVariants({ variant: 'outline', size: 'sm' }),
				'bg-card min-w-0 gap-1.5 text-sm font-semibold'
			)}
			aria-label="{name}: switch to another {noun}"
			data-slot="record-switcher-trigger"
		>
			<span class="truncate">{name}</span>
			<ChevronDown class="text-muted-foreground" />
		</Popover.Trigger>
		<Popover.Content align="start" class="w-[min(24rem,calc(100vw-2rem))] p-0">
			<Command.Root class="rounded-md!" label={placeholder} {filter} loop bind:value={highlighted}>
				<Command.Input {placeholder} />
				<Command.List class="max-h-[min(28rem,60vh)] px-1 pt-1">
					<Command.Empty class="text-muted-foreground py-5">No {noun} by that name</Command.Empty>
					{#each groups as g, gi (g.label ?? gi)}
						<CommandPrimitive.Group class="pb-1" value={g.label ?? `group-${gi}`}>
							{#if g.label}
								<CommandPrimitive.GroupHeading class={cn(eyebrow, 'px-2 pt-2 pb-1.5')}>
									{g.label}
								</CommandPrimitive.GroupHeading>
							{/if}
							<CommandPrimitive.GroupItems>
								{#each g.items as item (item.id)}
									{@const on = item.id === current}
									<Command.LinkItem
										href={item.href}
										value={valueOf(item)}
										onSelect={() => (open = false)}
										onclick={() => (open = false)}
										aria-current={on ? 'page' : undefined}
										class={cn('gap-3 rounded-md py-1.5', on && 'bg-primary/10')}
										data-slot="record-switcher-item"
									>
										{#if thumbs}<Thumbnail src={item.image} {icon} class="size-10" />{/if}
										<span class="flex min-w-0 flex-1 flex-col">
											<span class="text-foreground truncate font-medium">{item.label}</span>
											{#if item.note}
												<span class="text-muted-foreground truncate text-xs">{item.note}</span>
											{/if}
										</span>
										{#if on}<Check class="text-primary size-4" /><span class="sr-only">, open now</span>{/if}
									</Command.LinkItem>
								{/each}
							</CommandPrimitive.GroupItems>
						</CommandPrimitive.Group>
					{/each}
				</Command.List>
				{#if all}
					<div class="border-border border-t p-1">
						<a
							href={all.href}
							class="text-foreground hover:bg-accent focus-visible:ring-ring/50 block rounded-md px-2 py-2 text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
							onclick={() => (open = false)}
							data-slot="record-switcher-all">{all.label}</a
						>
					</div>
				{/if}
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	{#if pages.length}
		<nav aria-label="Pages of {name}" class="ml-1 flex items-stretch gap-1 self-stretch sm:ml-3">
			{#each pages as p (p.href)}
				<a
					href={p.href}
					aria-current={p.current ? 'page' : undefined}
					class={cn(
						'flex items-center border-b-2 px-2 text-sm transition-colors sm:px-3',
						p.current
							? 'border-primary text-foreground font-semibold'
							: 'text-muted-foreground hover:text-foreground border-transparent'
					)}
				>
					{p.label}
				</a>
			{/each}
		</nav>
	{/if}
</div>
