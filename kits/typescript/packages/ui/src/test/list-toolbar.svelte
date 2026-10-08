<script lang="ts">
	// Fixture for list-toolbar.test.ts: the bar with a view switch before the
	// title and a control of the list's own before its icon actions.
	import ListToolbar from '$lib/components/ui/list-toolbar';
	import type { ListAction, ListIconAction } from '$lib/components/ui/list-toolbar';

	let {
		title,
		meta,
		label,
		tools = [],
		action,
		withLeading = false,
		withControl = false
	}: {
		title?: string;
		meta?: string;
		label?: string;
		tools?: ListIconAction[];
		action?: ListAction;
		withLeading?: boolean;
		withControl?: boolean;
	} = $props();
</script>

{#snippet lead()}<button type="button">By property</button>{/snippet}

{#snippet control()}<button type="button">Columns</button>{/snippet}

<ListToolbar
	{title}
	{meta}
	{label}
	{tools}
	{action}
	leading={withLeading ? lead : undefined}
	children={withControl ? control : undefined}
/>
