<script lang="ts">
	import type { Snippet } from 'svelte';

	// One section of a dialogue body. An optional section label sits above
	// the content; a horizontal divider is drawn automatically between adjacent
	// sections (see `.ds-dialog-section + .ds-dialog-section` in
	// @poodle64/ui/styles.css), so every dialogue separates its information the
	// same way. Place sibling DialogSections directly inside an AppDialog body;
	// the first carries no divider.
	let { label, children }: { label?: string; children: Snippet } = $props();
</script>

<section class="ds-dialog-section space-y-3">
	{#if label}
		<div class="ds-label">
			{label}
		</div>
	{/if}
	{@render children()}
</section>
