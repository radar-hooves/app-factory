<script lang="ts">
	import CheckCircle from '#lib/icons/check-circle.svelte';
	import Circle from '#lib/icons/circle.svelte';
	import Info from '#lib/icons/info.svelte';
	import MinusCircle from '#lib/icons/minus-circle.svelte';
	import Warning from '#lib/icons/warning.svelte';
	import XCircle from '#lib/icons/x-circle.svelte';
	import { cn } from '#lib/utils.js';
	import type { Status } from './index.js';

	// A state's mark: its own glyph in its own colour, so states differ in shape as
	// well as hue, the eye finds them before it reads, and a reader who cannot tell
	// the hues apart still can (WCAG 1.4.1). StatusBadge, StatCard and StatList
	// draw every state with it.
	let {
		status,
		pulse = false,
		class: className
	}: {
		status: Status | 'primary';
		/** Breathe, for a state that is still moving; still under reduced motion. */
		pulse?: boolean;
		class?: string;
	} = $props();

	const GLYPH = {
		success: CheckCircle,
		warning: Warning,
		error: XCircle,
		info: Info,
		neutral: MinusCircle,
		primary: Circle
	};
	const Glyph = $derived(GLYPH[status]);
</script>

<Glyph
	class={cn('ds-status-icon', `ds-ink-${status}`, pulse && 'ds-dot-pulse', className)}
	data-status={status}
/>
