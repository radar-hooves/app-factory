<script lang="ts">
	let { source }: { source: string } = $props();
</script>

<figure data-testid="chart">{source.trim().split('\n').length} rows</figure>
