<!--
	Who this person may ask: the personas they are granted (`GET /api/agent/personas`),
	each a link to its own page, and straight to the page of the only one. A
	reader sees whom they are asking, never how the app serves them
	(canonical-app-shape.md §Milton is a person, not a place).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageHeader from '@poodle64/ui/page-header';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { TileGrid } from '@poodle64/ui/tile-grid';
	import { api, describeApiError } from '$lib/api';
	import type { Persona } from '$lib/agent/chat';

	let personas = $state<Persona[] | null>(null);
	let failed = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await api.GET('/api/agent/personas');
		if (error) {
			failed = describeApiError(error, 'Could not load who you can ask');
			return;
		}
		const only = data.length === 1 ? data[0] : undefined;
		if (only) {
			await goto(`/chat/${only.id}`, { replaceState: true });
			return;
		}
		personas = data;
	});
</script>

<PageHeader title="Ask" subtitle="Put a question to whoever can answer it." />

{#if failed}
	<EmptyState title="Nothing to show" description={failed} />
{:else if personas === null}
	<LoadingState />
{:else if personas.length === 0}
	<EmptyState
		title="Nobody to ask yet"
		description="You have not been given anyone to ask questions of here."
	/>
{:else}
	<TileGrid tag="ul" class="mt-6">
		{#each personas as persona (persona.id)}
			<li>
				<a
					href="/chat/{persona.id}"
					class="bg-card text-card-foreground hover:border-primary focus-visible:ring-ring block h-full rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<span class="block font-medium">Ask {persona.name}</span>
					{#if persona.blurb}
						<span class="text-muted-foreground mt-1 block text-sm">{persona.blurb}</span>
					{/if}
				</a>
			</li>
		{/each}
	</TileGrid>
{/if}
