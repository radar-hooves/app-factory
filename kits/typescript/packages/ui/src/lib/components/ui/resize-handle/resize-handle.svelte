<script lang="ts">
	/**
	 * The drag edge of a resizable side panel: the one implementation behind
	 * AppShell's rail, for an app whose sidebar is its own element.
	 *
	 * Render it as the LAST child of the panel, and give the panel
	 * `position: relative` (or sticky) and `width: <width>px` while `width` is
	 * set. It owns the pointer drag, the keyboard (arrows nudge, Home resets,
	 * End takes the maximum), the double-click reset and persistence; the panel
	 * owns how the number is applied.
	 *
	 * The ceiling is measured against the CONTENT beside the panel, not the
	 * window: the panel's parent is the row, so the panel can never grow past
	 * `row width - minContent`, whatever the screen.
	 */
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	let {
		width = $bindable(null),
		dragging = $bindable(false),
		min = 200,
		max = 420,
		minContent = 480,
		step = 16,
		snap,
		onsnap,
		storageKey,
		label = 'Resize sidebar',
		class: className,
		...rest
	}: Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		/** Panel width in px; `null` is the panel's own default. */
		width?: number | null;
		/** True during a pointer drag: switch the panel's width transition off. */
		dragging?: boolean;
		min?: number;
		max?: number;
		/** Least width the content beside the panel keeps. */
		minContent?: number;
		/** Arrow-key nudge in px. */
		step?: number;
		/** A drag below this calls `onsnap` (collapse) and keeps the old width. */
		snap?: number;
		onsnap?: () => void;
		/** localStorage key; one per app. Omitted, nothing is stored. */
		storageKey?: string;
		label?: string;
	} = $props();

	$effect(() => {
		if (!storageKey) return;
		try {
			const stored = Number(localStorage.getItem(storageKey));
			if (stored >= min && stored <= max) width = stored;
		} catch {
			/* storage unavailable: the default width stands */
		}
	});

	let handle: HTMLElement;
	const panel = () => handle.parentElement as HTMLElement;
	const clamp = (next: number) => {
		const row = panel().parentElement?.getBoundingClientRect().width || Infinity;
		const ceiling = Math.max(min, Math.min(max, row - minContent));
		return Math.min(ceiling, Math.max(min, Math.round(next)));
	};
	const store = (value: number | null) => {
		if (!storageKey) return;
		try {
			if (value === null) localStorage.removeItem(storageKey);
			else localStorage.setItem(storageKey, String(value));
		} catch {
			/* storage unavailable: the width lasts the session */
		}
	};
	const set = (next: number) => {
		width = clamp(next);
		store(width);
	};
	const reset = () => {
		width = null;
		store(null);
	};

	let drag: { x: number; start: number; before: number | null } | null = null;
	function down(event: PointerEvent) {
		drag = { x: event.clientX, start: panel().getBoundingClientRect().width, before: width };
		dragging = true;
		handle.setPointerCapture(event.pointerId);
	}
	function move(event: PointerEvent) {
		if (!drag) return;
		const next = drag.start + event.clientX - drag.x;
		if (snap !== undefined && next < snap) {
			width = drag.before;
			end(event);
			onsnap?.();
		} else width = clamp(next);
	}
	function end(event: PointerEvent) {
		if (!drag) return;
		const moved = width !== drag.before;
		drag = null;
		dragging = false;
		if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
		if (moved && width !== null) store(width);
	}
	function key(event: KeyboardEvent) {
		const current = width ?? panel().getBoundingClientRect().width;
		if (event.key === 'ArrowLeft') set(current - step);
		else if (event.key === 'ArrowRight') set(current + step);
		else if (event.key === 'Home') reset();
		else if (event.key === 'End') set(max);
		else return;
		event.preventDefault();
	}
</script>

<!-- A focusable separator is the ARIA window-splitter pattern. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={handle}
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={width ?? undefined}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex="0"
	class={cn('ds-resize-handle', className)}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={end}
	onpointercancel={end}
	onkeydown={key}
	ondblclick={reset}
	{...rest}
></div>
