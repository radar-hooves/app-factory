<script lang="ts">
	// Fixture for context-column-record.test.ts: a record page's column, the
	// opened section swapped by the page, a lease's document opened beside it.
	import ContextColumn from '$lib/components/ui/context-column';
	import DocumentPane from '$lib/components/ui/document-pane';

	let { withDocument = false }: { withDocument?: boolean } = $props();

	let section = $state('Tenancy');
	// svelte-ignore state_referenced_locally
	let lease = $state(withDocument);
	let closed = $state(0);
</script>

{#snippet doc()}
	<DocumentPane title="Residential tenancy agreement" pages={['/p1.png']} onClose={() => (lease = false)} />
{/snippet}

<button type="button" onclick={() => (section = 'Insurance')}>Insurance</button>
<button type="button" onclick={() => (lease = true)}>Open the lease</button>
<ContextColumn
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
<output data-probe="closed">{closed}</output>
