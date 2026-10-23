<script lang="ts">
	/**
	 * Registers this page's own actions at the head of the shell's top bar's
	 * right-hand group. Renders nothing where it stands. One registration at a
	 * time; a later one replaces an earlier one.
	 *
	 *     <ShellActions>
	 *       <Button size="icon" aria-label="Past questions" onclick={open}>…</Button>
	 *     </ShellActions>
	 */
	import type { Snippet } from 'svelte';
	import { getShellControls } from './controls.js';

	let { children }: { children: Snippet } = $props();

	const slot = getShellControls();

	$effect(() => {
		if (!slot) return;
		slot.actions = children;
		return () => {
			if (slot.actions === children) slot.actions = null;
		};
	});
</script>
