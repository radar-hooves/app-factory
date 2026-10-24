<script lang="ts">
	// Fixture for context-column-record.test.ts: a tool page in the shell whose
	// aside is a ContextColumn: a record's opened section swapped by the page, a
	// lease's document opened in its place, or (`list`) a list page's stat card.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import ContextColumn from '$lib/components/ui/context-column';
	import DocumentPane from '$lib/components/ui/document-pane';

	let {
		withDocument = false,
		ariaLabel,
		list = false
	}: { withDocument?: boolean; ariaLabel?: string; list?: boolean } = $props();

	let section = $state('Tenancy');
	// svelte-ignore state_referenced_locally
	let lease = $state(withDocument);
	let closed = $state(0);
</script>

{#snippet doc()}
	<DocumentPane title="Residential tenancy agreement" pages={['/p1.png']} onClose={() => (lease = false)} />
{/snippet}

<AppShell
	nav={[{ label: 'Overview', href: '/overview' }]}
	currentPath="/overview"
	brandTitle="Harness"
	pageType="tool"
>
	<button type="button" onclick={() => (section = 'Insurance')}>Insurance</button>
	<button type="button" onclick={() => (lease = true)}>Open the lease</button>
	{#if list}
		<ContextColumn
			{ariaLabel}
			stats={[{ label: 'Value', value: 1 }]}
			statsInfo="Held today."
		/>
	{:else}
		<ContextColumn
			{ariaLabel}
			title={section}
			subtitle={section === 'Tenancy' ? 'Opened on what needs you' : undefined}
			onClose={() => {
				closed++;
				section = 'Tenancy';
			}}
			documentPane={lease ? doc : undefined}
		>
			<p data-probe="body">{section} body</p>
		</ContextColumn>
	{/if}
	<output data-probe="closed">{closed}</output>
</AppShell>
