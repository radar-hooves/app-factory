<!--
	Who this person may ask: the rooms they are granted (`GET /api/agent/rooms`),
	each a link to its own page. "Room" is a word for code and routes only; a
	reader sees whom they are asking and about what
	(canonical-app-shape.md §Milton is a person, not a place).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import PageHeader from '@poodle64/ui/page-header';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { TileGrid } from '@poodle64/ui/tile-grid';
	import { api, describeApiError } from '$lib/api';
	import type { Room } from '$lib/agent/rooms';

	let rooms = $state<Room[] | null>(null);
	let failed = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await api.GET('/api/agent/rooms');
		if (error) failed = describeApiError(error, 'Could not load who you can ask');
		else rooms = data;
	});
</script>

<PageHeader title="Ask" subtitle="Put a question to whoever can answer it." />

{#if failed}
	<EmptyState title="Nothing to show" description={failed} />
{:else if rooms === null}
	<LoadingState />
{:else if rooms.length === 0}
	<EmptyState
		title="Nobody to ask yet"
		description="You have not been given anyone to ask questions of here."
	/>
{:else}
	<TileGrid tag="ul" class="mt-6">
		{#each rooms as room (room.id)}
			<li>
				<a
					href="/rooms/{room.id}"
					class="bg-card text-card-foreground hover:border-primary focus-visible:ring-ring block h-full rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<span class="block font-medium">
						{room.library ? `Ask Milton about ${room.title}` : `Ask ${room.title}`}
					</span>
					{#if room.blurb}
						<span class="text-muted-foreground mt-1 block text-sm">{room.blurb}</span>
					{/if}
				</a>
			</li>
		{/each}
	</TileGrid>
{/if}
