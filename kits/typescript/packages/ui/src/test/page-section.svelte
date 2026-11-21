<script lang="ts">
	// Fixture for page-section.test.ts: the snippet-bearing props (actions, body).
	import type { Component } from 'svelte';
	import PageSection from '#lib/components/ui/page-section/page-section.svelte';

	let {
		id,
		level,
		count,
		title = 'Recent',
		icon
	}: {
		id?: string;
		level?: 2 | 3;
		count?: number;
		title?: string;
		icon?: Component<{ class?: string }>;
	} = $props();
</script>

<PageSection {title} {id} {level} {count} {icon} description="What came in lately.">
	{#snippet actions()}
		<button type="button">Add one</button>
	{/snippet}
	<p>Body text</p>
</PageSection>
