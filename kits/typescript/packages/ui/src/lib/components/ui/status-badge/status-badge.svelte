<script lang="ts">
	import type { Status } from '../status/index.js';
	import { cn } from '$lib/utils.js';

	// The one state chip: a coloured dot plus a label on a tinted pill. Styling
	// comes from .ds-chip / .ds-dot in @poodle64/ui/styles.css, so the whole app's
	// status vocabulary changes in one place.
	let {
		status,
		label,
		pulse = false,
		class: className
	}: {
		/**
		 * The shared five-state Status vocabulary, plus `'primary'` — a
		 * StatusBadge-only extension for brand-emphasis chips (not a health
		 * state), backed by `.ds-chip-primary`/`.ds-dot-primary`. The shared
		 * `Status` type itself stays closed at five states; StatCard, StatList
		 * and DataTableToolbar never see `'primary'`.
		 */
		status: Status | 'primary';
		label: string;
		/**
		 * Animate the dot, for a state that is still moving.
		 *
		 * The vocabulary is five settled states, and an app kept a local badge
		 * purely because none of them says "in progress": a sync that is running
		 * and a sync that has finished are both `info`, and the chip reads
		 * identically. Motion is the axis that separates them, and it is the right
		 * axis — it carries no colour meaning, so it composes with all five without
		 * adding a sixth state to a vocabulary that is deliberately closed.
		 *
		 * Motion is honoured only where it is welcome: under
		 * `prefers-reduced-motion: reduce` the dot goes still (`.ds-dot-pulse` in
		 * styles.css). It is therefore never the only carrier of meaning — the
		 * label still says what is happening (WCAG 1.4.1).
		 */
		pulse?: boolean;
		/**
		 * Extra classes on the chip. The same chip lands in a table cell, a card
		 * header and a toolbar, and only the call site knows the alignment or
		 * measure its row needs; without this an app wraps the chip in a
		 * positioning div or keeps a local copy. Placement is the call site's;
		 * colour and shape stay this package's.
		 */
		class?: string;
	} = $props();
</script>

<span class={cn('ds-chip', `ds-chip-${status}`, className)}>
	<span class={cn('ds-dot', `ds-dot-${status}`, pulse && 'ds-dot-pulse')}></span>
	{label}
</span>
