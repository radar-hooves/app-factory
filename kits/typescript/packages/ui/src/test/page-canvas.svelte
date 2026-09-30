<script lang="ts">
	// Fixture for page-canvas.test.ts: forwards every prop under test and
	// exposes bindable state so a test can read what the canvas has driven.
	import PageCanvas from '$lib/components/ui/page-canvas/page-canvas.svelte';
	import type { PageCanvasRegion } from '$lib/components/ui/page-canvas/types';

	let {
		pageCount = 1,
		currentPage = $bindable(1),
		regions = [],
		lookedRegions = [],
		activeRegionId = $bindable(null),
		focusedRegionId = $bindable(null),
		zoom = $bindable(1)
	}: {
		pageCount?: number;
		currentPage?: number;
		regions?: PageCanvasRegion[];
		lookedRegions?: PageCanvasRegion[];
		activeRegionId?: string | null;
		focusedRegionId?: string | null;
		zoom?: number;
	} = $props();

	// A real consumer calls `reportSize` from an event handler (an image's
	// `onload`) or an effect, never from a template expression — Svelte
	// forbids a state mutation there. This action reproduces the "an event
	// handler reports the size" shape without needing a real image to load.
	function reportOnMount(_node: Element, reportSize: (w: number, h: number) => void) {
		reportSize(537, 2339);
	}
</script>

<PageCanvas
	{pageCount}
	bind:currentPage
	bind:activeRegionId
	bind:focusedRegionId
	bind:zoom
	{regions}
	{lookedRegions}
>
	{#snippet page(pageNumber, info)}
		<div data-testid="page-content" data-page={pageNumber} use:reportOnMount={info.reportSize}>
			page {pageNumber}
		</div>
	{/snippet}
</PageCanvas>
