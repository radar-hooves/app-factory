<script lang="ts">
	/**
	 * Marks what it wraps as inside one of the page's columns or a dialogue,
	 * not the page itself, so a component there (a DocumentReader in an aside)
	 * keeps its own layout rather than claiming the page's aside. `sections`,
	 * given by the aside, names the column its sections' folds are kept under.
	 */
	import type { Snippet } from 'svelte';
	import { markInColumn } from './page.js';
	import { provideColumnSections } from '../context-column/collapse.svelte.js';

	let { children, sections }: { children: Snippet; sections?: string } = $props();

	markInColumn();
	// The page's aside: every titled section in it folds, remembered under its name.
	// svelte-ignore state_referenced_locally
	if (sections !== undefined) provideColumnSections(() => sections);
</script>

{@render children()}
