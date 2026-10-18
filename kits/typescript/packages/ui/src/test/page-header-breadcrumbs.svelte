<script lang="ts">
	// Fixture for page-header.test.ts: the `breadcrumbs` prop given as a snippet,
	// the shape apps wrote before it accepted an array.
	import PageHeader from '$lib/components/ui/page-header/page-header.svelte';
</script>

<PageHeader title="Setup">
	{#snippet breadcrumbs()}
		<a href="/own">Own trail</a>
	{/snippet}
</PageHeader>
