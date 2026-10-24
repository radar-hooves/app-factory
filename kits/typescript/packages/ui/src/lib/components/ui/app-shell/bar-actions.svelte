<script lang="ts">
	/** The page's actions in the bar: buttons from `sm`, one "More actions" menu below it. */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { Button } from '../button/index.js';
	import * as DropdownMenu from '../dropdown-menu/index.js';
	import type { BarActionsSlot } from './controls.js';

	let { bar }: { bar: BarActionsSlot } = $props();
</script>

<div class="flex items-center gap-2" data-testid="ds-shell-page-actions">
	{#if bar.status}
		<span class="text-muted-foreground hidden text-sm tabular-nums sm:inline">{bar.status}</span>
	{/if}
	<div class="hidden items-center gap-2 sm:flex">
		{#each bar.actions as action (action.label)}
			<Button
				size="sm"
				variant={action.primary ? 'default' : 'outline'}
				href={action.href}
				download={action.download ? '' : undefined}
				onclick={action.onclick}
				title={action.detail}
				class="pointer-coarse:h-11"
			>
				<action.icon class="size-4" />
				{action.label}
			</Button>
		{/each}
	</div>
	{#if bar.actions.length > 0}
		<div class="sm:hidden">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="border-border text-shell-muted-foreground hover:text-shell-foreground grid size-9 flex-none place-items-center rounded-md border transition-colors pointer-coarse:size-11"
					aria-label="More actions"
					data-testid="ds-shell-more"
				>
					<Ellipsis class="size-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-48">
					{#each bar.actions as action (action.label)}
						{#if action.href}
							<DropdownMenu.Item class="pointer-coarse:min-h-11 pointer-coarse:text-base">
								{#snippet child({ props })}
									<a
										{...props}
										href={action.href}
										download={action.download ? '' : undefined}
										title={action.detail}
									>
										<action.icon class="size-4" />
										{action.label}
									</a>
								{/snippet}
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Item
								onSelect={() => action.onclick?.()}
								class="pointer-coarse:min-h-11 pointer-coarse:text-base"
							>
								<action.icon class="size-4" />
								{action.label}
							</DropdownMenu.Item>
						{/if}
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	{/if}
</div>
