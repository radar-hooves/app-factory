<script lang="ts">
	/**
	 * Registers this page's controls in the shell's top bar. Renders nothing
	 * where it stands.
	 *
	 *     <ShellControls>
	 *       <Segmented bind:value={fy} options={years} label="Financial year" />
	 *     </ShellControls>
	 */
	import type { Snippet } from 'svelte';
	import { getShellControls } from './controls.js';

	let { children }: { children: Snippet } = $props();

	const slot = getShellControls();

	$effect(() => {
		if (!slot) return;
		slot.content = children;
		return () => {
			if (slot.content === children) slot.content = null;
		};
	});
</script>
