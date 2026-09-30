<script lang="ts">
	// Fixture for sparkline.test.ts: forwards exactly the props the tests vary.
	import Sparkline, { type Series } from '$lib/components/ui/sparkline';

	let {
		series,
		width,
		height,
		pad
	}: {
		series: Series[];
		width: number;
		height: number;
		pad?: number;
	} = $props();
</script>

<Sparkline {series} {width} {height} {pad} />
