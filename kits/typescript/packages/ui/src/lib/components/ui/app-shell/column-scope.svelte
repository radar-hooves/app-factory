<script lang="ts">
	/**
	 * Marks what it wraps as inside one of the page's columns or a dialogue,
	 * not the page itself, so a component there (a DocumentReader in an aside)
	 * keeps its own layout rather than claiming the page's aside.
	 */
	import type { Snippet } from 'svelte';
	import { markInColumn } from './page.js';

	let { children }: { children: Snippet } = $props();

	markInColumn();
</script>

{@render children()}
