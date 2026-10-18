<script lang="ts">
	// Fixture for page-section.test.ts: the snippet-bearing props (actions, body).
	import PageSection from '$lib/components/ui/page-section/page-section.svelte';

	let {
		id,
		level,
		count,
		title = 'Recent'
	}: { id?: string; level?: 2 | 3; count?: number; title?: string } = $props();
</script>

<PageSection {title} {id} {level} {count} description="What came in lately.">
	{#snippet actions()}
		<button type="button">Add one</button>
	{/snippet}
	<p>Body text</p>
</PageSection>
