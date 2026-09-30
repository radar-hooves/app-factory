<!--
	A test app's room home (`RoomExtensions.Home`): what happened lately, a list
	tall enough that on a phone it has to scroll with the conversation rather
	than take its height.
-->
<script lang="ts">
	import type { Room } from '$lib/agent/rooms';

	let { room }: { room: Room } = $props();

	const lately = [
		['1 Jun 2026', 'The leave chapter of the Manual was reissued.'],
		['14 May 2026', 'A new allowance for remote postings came into force.'],
		['2 May 2026', 'Long service leave rules were clarified for reservists.'],
		['20 Apr 2026', 'Recreation leave accrual for part-time members was restated.']
	];
</script>

<section aria-label="Lately" data-testid="app-home" class="flex flex-col gap-2">
	<h2 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
		Lately in {room.title}
	</h2>
	<ul class="border-border divide-border flex flex-col divide-y border-y">
		{#each lately as [when, what] (when)}
			<li class="flex gap-3 py-2 text-sm">
				<span class="text-muted-foreground w-24 shrink-0 tabular-nums">{when}</span>
				<span>{what}</span>
			</li>
		{/each}
	</ul>
</section>
