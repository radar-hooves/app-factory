<script lang="ts">
	// Harness for Panel's header, footer and tone. `withFooter` is a separate flag
	// rather than always-on, because absence is half the contract: a panel with no
	// footer must render no strip at all, not an empty one with a rule across it.
	//
	// The snippets are declared at the top level and passed as props, not nested
	// inside an `{#if}` in Panel's body: a snippet becomes a prop only where it is
	// a direct child of the component, so the conditional has to be on the value.
	import Panel from '$lib/components/ui/panel/panel.svelte';
	import Trash from '@lucide/svelte/icons/trash-2';

	let {
		title = 'Delegation limits',
		subtitle,
		description,
		tone = 'default',
		withFooter = false,
		withIcon = false,
		withAction = false
	}: {
		title?: string;
		subtitle?: string;
		description?: string;
		tone?: 'default' | 'destructive';
		withFooter?: boolean;
		withIcon?: boolean;
		withAction?: boolean;
	} = $props();
</script>

{#snippet headerAction()}
	<button type="button">Add</button>
{/snippet}

{#snippet footerActions()}
	<button type="button">Cancel</button>
	<button type="button">Save</button>
{/snippet}

<Panel
	{title}
	{subtitle}
	{description}
	{tone}
	icon={withIcon ? Trash : undefined}
	action={withAction ? headerAction : undefined}
	footer={withFooter ? footerActions : undefined}
>
	<p>Controls</p>
</Panel>
