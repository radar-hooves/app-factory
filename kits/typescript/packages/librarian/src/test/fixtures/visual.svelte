<script lang="ts">
	let { value, source }: { value: unknown; source: string } = $props();
</script>

<figure data-testid="visual" data-source={source}>{JSON.stringify(value)}</figure>
