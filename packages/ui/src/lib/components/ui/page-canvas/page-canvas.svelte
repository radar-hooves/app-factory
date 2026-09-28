<script lang="ts">
	// One page at a time, fitted to its pane both ways so an A4 statement and a
	// tall phone-scanned receipt both fill it — the shared engine behind
	// godswood's run view and pebblestone's invoice/quote panes alike
	// (radar-hooves/godswood#839). The package draws no page itself: a
	// consumer supplies image URLs, a PDF canvas, or any other render through
	// the `page` snippet, and reports each page's own intrinsic size once it
	// is known (an image's `onload`, a PDF viewport) via `reportSize` — this
	// component owns only the fit/zoom/pan/pager arithmetic and the evidence
	// overlay drawn on top of it.
	//
	// A region is a box in PAGE FRACTIONS (0–1 each way), never a pixel tied
	// to one raster's resolution, so the same shape works whatever the page's
	// native size turns out to be. `activeRegionId` (hover, from a list the
	// consumer renders beside the page) and `focusedRegionId` (click) both
	// show the same solid outline; a click also zooms in on the region and
	// centres it, leaving room for its label beside it where there is room
	// and above it where there is not — the same room-check either way, since
	// pinning only changes how much of the pane the page takes up.
	// `lookedRegions` draws a further, non-interactive dashed set — "where it
	// looked" — for the current page only.
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { Skeleton } from '../skeleton/index.js';
	import { Button } from '../button/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import Maximize from '@lucide/svelte/icons/maximize';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { PageCanvasRegion, PageCanvasRenderInfo } from './types.js';

	let {
		pageCount,
		currentPage = $bindable(1),
		page,
		regions = [],
		lookedRegions = [],
		activeRegionId = $bindable(null),
		focusedRegionId = $bindable(null),
		zoom = $bindable(1),
		class: klass = '',
		ref = $bindable(null),
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		pageCount: number;
		/** 1-based; bindable so a caller can drive it from outside (a thumbnail rail). */
		currentPage?: number;
		/** Renders one page's content at the size this canvas computes for it. */
		page: Snippet<[pageNumber: number, info: PageCanvasRenderInfo]>;
		/** Every region across every page; only the current page's are drawn. */
		regions?: PageCanvasRegion[];
		/** The non-interactive dashed "where it looked" set for the current page. */
		lookedRegions?: PageCanvasRegion[];
		/** Hovered in a list beside the page. */
		activeRegionId?: string | null;
		/** Clicked; zooms in on and centres the region. */
		focusedRegionId?: string | null;
		zoom?: number;
	} = $props();

	// The stage's own reserved space: PAD_X across both edges, PAD_TOP above
	// the page, PAD_BOTTOM below it — room for the control bar so it sits
	// clear of the fitted page rather than over its corners. LABEL_RESERVE is
	// how much room beside the page a region's label needs to sit in it
	// rather than above it.
	const PAD_X = 24;
	const PAD_TOP = 12;
	const PAD_BOTTOM = 64;
	const LABEL_RESERVE = 300;
	const ZOOM_MIN = 0.5;
	const ZOOM_MAX = 3;
	const ZOOM_STEP = 0.25;
	// How far a focused region may zoom past the whole-page fit, and how much
	// smaller than that a beside-the-page layout is still allowed to be
	// before it gives up the side column and fills the pane's width instead.
	const FOCUS_MAX_OVER_FIT = 3.4;
	const FOCUS_MIN_FOR_SIDE_LABEL = 1.2;

	let stageW = $state(0);
	let stageH = $state(0);
	let natural = $state<Record<number, { width: number; height: number }>>({});

	function reportSize(pageNumber: number) {
		return (width: number, height: number) => {
			if (width <= 0 || height <= 0) return;
			const known = natural[pageNumber];
			if (known && known.width === width && known.height === height) return;
			natural[pageNumber] = { width, height };
		};
	}

	function clampZoom(value: number): number {
		return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
	}
	function zoomIn() {
		zoom = clampZoom(zoom + ZOOM_STEP);
	}
	function zoomOut() {
		zoom = clampZoom(zoom - ZOOM_STEP);
	}

	function goToPage(target: number) {
		const next = Math.min(pageCount, Math.max(1, target));
		if (next === currentPage) return;
		currentPage = next;
		zoom = 1;
		focusedRegionId = null;
	}
	function prevPage() {
		goToPage(currentPage - 1);
	}
	function nextPage() {
		goToPage(currentPage + 1);
	}
	function backToWholePage() {
		focusedRegionId = null;
	}

	// Focusing a region on another page turns to that page — the approved
	// canvas's own rule (`pg = pinned ? line.page : st.pg`). Hover does not:
	// only a click is decisive enough to leave the page the caller is reading.
	$effect(() => {
		if (focusedRegionId === null) return;
		const region = regions.find((r) => r.id === focusedRegionId);
		if (region && region.page !== currentPage) currentPage = region.page;
	});

	function handleWheel(event: WheelEvent) {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		if (event.deltaY < 0) zoomIn();
		else zoomOut();
	}
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			prevPage();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			nextPage();
		} else if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			zoomIn();
		} else if (event.key === '-') {
			event.preventDefault();
			zoomOut();
		} else if (event.key === '0') {
			event.preventDefault();
			zoom = 1;
		} else if (event.key === 'Escape' && focusedRegionId !== null) {
			event.preventDefault();
			backToWholePage();
		}
	}

	const size = $derived(natural[currentPage]);
	const focusedRegion = $derived(
		focusedRegionId
			? (regions.find((r) => r.id === focusedRegionId && r.page === currentPage) ?? null)
			: null
	);
	const shownRegionId = $derived(focusedRegionId ?? activeRegionId);
	const shownRegion = $derived(
		shownRegionId ? (regions.find((r) => r.id === shownRegionId && r.page === currentPage) ?? null) : null
	);
	const lookedOnPage = $derived(lookedRegions.filter((r) => r.page === currentPage));

	// The whole-page fit, then a focused region's own zoom-and-centre, ported
	// from the fat-controller run-view design canvas (godswood
	// docs/design/fat-controller/project/Run-*.dc.html, `renderVals`). Past
	// the fit, the frame outgrows the pane; `left`/`top` are floored at 0 so
	// the page's own top-left corner is always the reachable start of the
	// scrollable stage below rather than an offset an `overflow: auto` box
	// can never scroll to (a negative position is outside its scroll range),
	// and whatever spills past the pane's other edges scrolls into view there
	// instead of the centring maths trying to pre-empt every edge itself.
	const layout = $derived.by(() => {
		const n = size;
		if (!n || stageW <= PAD_X || stageH <= PAD_TOP + PAD_BOTTOM) return null;
		const fit = Math.min((stageW - PAD_X) / n.width, (stageH - PAD_TOP - PAD_BOTTOM) / n.height);
		let scale = fit * zoom;
		let top = PAD_TOP;
		let left = (stageW - n.width * scale) / 2;
		let tagRight = stageW - n.width * scale >= LABEL_RESERVE;
		if (focusedRegion) {
			let s = Math.min(fit * FOCUS_MAX_OVER_FIT, (stageW - LABEL_RESERVE - PAD_X) / n.width);
			tagRight = s >= fit * FOCUS_MIN_FOR_SIDE_LABEL;
			if (!tagRight) s = Math.min(fit * FOCUS_MAX_OVER_FIT, (stageW - PAD_X) / n.width);
			scale = Math.max(s, scale);
			const cy = (focusedRegion.box.y + focusedRegion.box.h / 2) * n.height;
			top = Math.min(
				PAD_TOP,
				Math.max(stageH - PAD_BOTTOM - n.height * scale, (stageH - PAD_BOTTOM) / 2 - cy * scale)
			);
			left = tagRight
				? Math.max(PAD_X / 2, (stageW - LABEL_RESERVE - n.width * scale) / 2)
				: (stageW - n.width * scale) / 2;
		}
		return {
			scale,
			top: Math.max(0, top),
			left: Math.max(0, left),
			tagRight,
			width: n.width * scale,
			height: n.height * scale
		};
	});

	const renderInfo = $derived<PageCanvasRenderInfo>({
		size: layout ? { width: layout.width, height: layout.height } : { width: 0, height: 0 },
		reportSize: reportSize(currentPage)
	});

	const frameStyle = $derived(
		layout
			? `position:absolute; left:${layout.left}px; top:${layout.top}px; width:${layout.width}px; height:${layout.height}px; transition: left 280ms cubic-bezier(0.2,0,0,1), top 280ms cubic-bezier(0.2,0,0,1), width 280ms cubic-bezier(0.2,0,0,1), height 280ms cubic-bezier(0.2,0,0,1);`
			: `position:absolute; left:0; top:0; opacity:0; pointer-events:none;`
	);

	function regionBoxStyle(r: PageCanvasRegion): string {
		const n = size!;
		const l = layout!;
		return `position:absolute; left:${r.box.x * n.width * l.scale}px; top:${r.box.y * n.height * l.scale}px; width:${r.box.w * n.width * l.scale}px; height:${r.box.h * n.height * l.scale}px;`;
	}

	function toggleFocus(r: PageCanvasRegion) {
		focusedRegionId = focusedRegionId === r.id ? null : r.id;
	}
	function onRegionKeydown(event: KeyboardEvent, r: PageCanvasRegion) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleFocus(r);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={ref}
	class={cn('relative outline-none', klass)}
	bind:clientWidth={stageW}
	bind:clientHeight={stageH}
	onwheel={handleWheel}
	onkeydown={handleKeydown}
	tabindex="0"
	role="document"
	aria-label="Document page; use arrow keys to change page"
	{...restProps}
>
	{#if pageCount === 0}
		<div class="text-muted-foreground flex h-full items-center justify-center text-sm">
			No pages available
		</div>
	{:else}
		<!--
			The controls below are siblings of this scroller, not children of it,
			so a page zoomed or focused past the pane scrolls under them rather
			than carrying them away with it.
		-->
		<div class="absolute inset-0 overflow-auto">
			<div style={frameStyle}>
				{#if !size}
					<Skeleton class="absolute inset-0" />
				{/if}
				{@render page(currentPage, renderInfo)}

				{#if layout}
					{#each lookedOnPage as region (region.id)}
						<div
							class="border-muted-foreground/70 bg-transparent pointer-events-none absolute rounded-sm border-2 border-dashed"
							style={regionBoxStyle(region)}
							aria-hidden="true"
						>
							{#if region.label}
								<span
									class="bg-card border-border text-muted-foreground absolute rounded-md border px-2 py-0.5 text-xs whitespace-nowrap"
									style={layout.tagRight
										? `left:${layout.width * (1 - region.box.x) + 10}px; top:0;`
										: 'left:4px; top:4px;'}
								>
									{region.label}
								</span>
							{/if}
						</div>
					{/each}

					{#if shownRegion}
						<div style={regionBoxStyle(shownRegion)} class="absolute">
							<span
								role="button"
								tabindex="0"
								class="border-primary bg-primary/10 absolute inset-0 cursor-pointer rounded-sm border-2"
								style="transform: rotate({shownRegion.rotateDeg ?? 0}deg); transition: all 160ms ease;"
								onclick={() => toggleFocus(shownRegion)}
								onkeydown={(e) => onRegionKeydown(e, shownRegion)}
								aria-label={shownRegion.label
									? `Focus the outlined region: ${shownRegion.label}`
									: 'Focus the outlined region'}
							></span>
							{#if shownRegion.label}
								<span
									class="bg-card border-border text-foreground absolute rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap"
									style={layout.tagRight
										? 'left: calc(100% + 12px); top: 50%; transform: translateY(-50%);'
										: 'left: 0; bottom: calc(100% + 8px);'}
								>
									{shownRegion.label}
								</span>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<div class="absolute bottom-3 left-3 flex items-center gap-2">
			{#if focusedRegion}
				<Button variant="outline" size="sm" onclick={backToWholePage}>Whole page</Button>
			{:else if pageCount > 1}
				<div class="bg-background flex items-center gap-0.5 rounded-lg p-1 shadow-sm">
					<Button
						variant="outline"
						size="icon"
						class="size-8"
						onclick={prevPage}
						disabled={currentPage <= 1}
						aria-label="Previous page"
					>
						<ChevronLeft class="size-4" />
					</Button>
					<span class="text-foreground min-w-16 text-center text-xs font-medium tabular-nums">
						{currentPage} / {pageCount}
					</span>
					<Button
						variant="outline"
						size="icon"
						class="size-8"
						onclick={nextPage}
						disabled={currentPage >= pageCount}
						aria-label="Next page"
					>
						<ChevronRight class="size-4" />
					</Button>
				</div>
			{/if}
		</div>

		<div
			class="bg-background absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg p-1 shadow-sm"
		>
			<Button variant="outline" size="icon" class="size-8" onclick={zoomOut} aria-label="Zoom out">
				<Minus class="size-4" />
			</Button>
			<span class="text-foreground min-w-11 text-center text-xs font-medium tabular-nums">
				{Math.round(zoom * 100)}%
			</span>
			<Button variant="outline" size="icon" class="size-8" onclick={zoomIn} aria-label="Zoom in">
				<Plus class="size-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				class="size-8"
				onclick={() => (zoom = 1)}
				aria-label="Fit the page"
			>
				<Maximize class="size-3.5" />
			</Button>
		</div>
	{/if}
</div>
