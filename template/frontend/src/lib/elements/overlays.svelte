<script lang="ts">
	/**
	 * The root of an element's markup. The kit's dialogue, popover, select and
	 * tooltip portal to the page's `<body>` by default, outside the shadow root,
	 * where they lose the kit's stylesheet; this gives them a layer inside it.
	 */
	import { BitsConfig } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let layer = $state<HTMLElement>();
</script>

<BitsConfig defaultPortalTo={layer}>{@render children()}</BitsConfig>
<div bind:this={layer}></div>
