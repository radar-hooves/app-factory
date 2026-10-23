<!-- A test app's `StateArt.ErrorArt`: art that varies by status. -->
<script lang="ts">
	let { status, message }: { status: number; message: string } = $props();
</script>

<svg
	role="img"
	aria-label="Art for {status}: {message}"
	data-testid="error-art"
	width="8"
	height="8"
></svg>
