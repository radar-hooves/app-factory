<script lang="ts">
	import CaretDown from '#lib/icons/caret-down.svelte';
	import type { ColumnSection } from './collapse.svelte.js';

	let { section, title, controls }: { section: ColumnSection; title: string; controls?: string } = $props();
</script>

<button
	type="button"
	class="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mr-1 grid size-7 flex-none place-items-center rounded-md focus-visible:ring-1 focus-visible:outline-none pointer-coarse:size-11"
	aria-label={section.collapsed ? `Expand ${title}` : `Collapse ${title}`}
	aria-expanded={!section.collapsed}
	aria-controls={controls}
	data-slot="section-toggle"
	onclick={section.toggle}
>
	<CaretDown class="size-4 transition-transform {section.collapsed ? '-rotate-90' : ''}" />
</button>
