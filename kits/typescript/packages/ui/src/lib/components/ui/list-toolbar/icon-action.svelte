<script lang="ts">
	/** An icon button, or an icon link, named by its tooltip. Inside a `Tooltip.Provider`. */
	import { mergeProps } from 'bits-ui';
	import { buttonVariants } from '../button/index.js';
	import * as Tooltip from '../tooltip/index.js';
	import type { ListIconAction } from './types.js';

	let { action }: { action: ListIconAction } = $props();
	const Icon = $derived(action.icon);
	const klass = buttonVariants({ variant: 'ghost', size: 'icon-sm' });

	/** The trigger's own handlers (a click closes the tooltip) chained with the action's. */
	const merged = (props: Record<string, unknown>) =>
		mergeProps(props, { onclick: action.onclick, class: klass, 'aria-label': action.label });
	/** A link takes no button `type`. */
	function asLink(props: Record<string, unknown>) {
		const { type: _type, ...rest } = merged(props);
		return rest;
	}
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			{#if action.href && !action.disabled}
				<a
					{...asLink(props)}
					href={action.href}
					download={action.download === true ? '' : action.download || undefined}
					data-slot="list-action"
				>
					<Icon />
				</a>
			{:else}
				<button {...merged(props)} type="button" disabled={action.disabled} data-slot="list-action">
					<Icon />
				</button>
			{/if}
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="bottom">{action.label}</Tooltip.Content>
</Tooltip.Root>
