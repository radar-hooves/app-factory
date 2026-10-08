<script lang="ts">
	import { ResizeHandle } from '$lib/components/ui/resize-handle/index.js';

	let { key = 'probe-width' }: { key?: string } = $props();
	let width = $state<number | null>(null);
	let dragging = $state(false);
</script>

<div style="display:flex">
	<aside
		data-testid="panel"
		data-dragging={dragging ? 'true' : undefined}
		style="position:relative;width:{width ?? 240}px"
	>
		<ResizeHandle bind:width bind:dragging storageKey={key} min={180} max={400} />
	</aside>
	<main>content</main>
</div>
