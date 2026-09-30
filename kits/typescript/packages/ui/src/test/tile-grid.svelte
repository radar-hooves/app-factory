<script lang="ts">
	// Fixture for tile-grid.test.ts: forwards the props under test and supplies
	// tiles whose element type matches the tag (li under ul, div under div), so
	// the rendered tree stays valid HTML in both modes.
	import TileGrid from '$lib/components/ui/tile-grid';

	let { min, gap, tag }: { min?: string; gap?: string; tag?: 'div' | 'ul' } = $props();
</script>

{#if tag === 'ul'}
	<TileGrid {min} {gap} {tag}>
		<li>one</li>
		<li>two</li>
	</TileGrid>
{:else}
	<TileGrid {min} {gap} {tag}>
		<div>one</div>
		<div>two</div>
	</TileGrid>
{/if}
