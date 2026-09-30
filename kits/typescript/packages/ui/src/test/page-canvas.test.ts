/**
 * The `page-canvas` primitive — the fit/zoom/pan/pager engine shared by
 * godswood's run view and pebblestone's PDF panes (#839).
 *
 * jsdom applies no layout, so `bind:clientWidth`/`clientHeight` on the stage
 * read 0 here and the fit/zoom/focus GEOMETRY (the whole reason this
 * component exists) cannot be asserted under it — that is proved in a real
 * engine (`harness/drive.mjs`, `?surface=page-canvas`), the same split this
 * package draws everywhere else (see `harness/drive.md`). What jsdom CAN
 * prove: the pager, zoom control and keyboard wiring, the empty state, and
 * that state changes (page, zoom, focus) actually happen and interact
 * correctly with each other — none of which needs a resolved pixel.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Harness from './page-canvas.svelte';
import type { PageCanvasRegion } from '$lib/components/ui/page-canvas/types';

const stage = () => screen.getByRole('document');
const zoomLabel = () => screen.getByText(/^\d+%$/);
const pageLabel = () => screen.queryByText(/^\d+ \/ \d+$/);

describe('PageCanvas — the empty and single-page states', () => {
	it('shows a message and no chrome when there are no pages', () => {
		render(Harness, { props: { pageCount: 0 } });
		expect(screen.getByText('No pages available')).toBeInTheDocument();
		expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
	});

	it('renders the page content for a single page', () => {
		render(Harness, { props: { pageCount: 1 } });
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 1');
	});

	it('hides the pager for a single page', () => {
		render(Harness, { props: { pageCount: 1 } });
		expect(pageLabel()).not.toBeInTheDocument();
	});

	it('always shows the zoom control, even for one page', () => {
		render(Harness, { props: { pageCount: 1 } });
		expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
		expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
	});
});

describe('PageCanvas — the pager', () => {
	it('shows the pager once there is more than one page', () => {
		render(Harness, { props: { pageCount: 3 } });
		expect(pageLabel()).toHaveTextContent('1 / 3');
	});

	it('disables Previous on the first page and Next on the last', () => {
		render(Harness, { props: { pageCount: 2 } });
		expect(screen.getByLabelText('Previous page')).toBeDisabled();
		expect(screen.getByLabelText('Next page')).not.toBeDisabled();
	});

	it('advances the page on Next, and renders that page\'s content', async () => {
		render(Harness, { props: { pageCount: 2 } });
		await fireEvent.click(screen.getByLabelText('Next page'));
		expect(pageLabel()).toHaveTextContent('2 / 2');
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 2');
		expect(screen.getByLabelText('Next page')).toBeDisabled();
	});

	it('does not advance past the last page', async () => {
		render(Harness, { props: { pageCount: 1 } });
		await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 1');
	});

	it('changes page on the arrow keys', async () => {
		render(Harness, { props: { pageCount: 2 } });
		await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
		expect(pageLabel()).toHaveTextContent('2 / 2');
		await fireEvent.keyDown(stage(), { key: 'ArrowLeft' });
		expect(pageLabel()).toHaveTextContent('1 / 2');
	});

	it('resets zoom to 100% when the page changes', async () => {
		render(Harness, { props: { pageCount: 2 } });
		await fireEvent.click(screen.getByLabelText('Zoom in'));
		expect(zoomLabel()).toHaveTextContent('125%');
		await fireEvent.click(screen.getByLabelText('Next page'));
		expect(zoomLabel()).toHaveTextContent('100%');
	});
});

describe('PageCanvas — zoom', () => {
	it('starts at 100%', () => {
		render(Harness, { props: { pageCount: 1 } });
		expect(zoomLabel()).toHaveTextContent('100%');
	});

	it('steps by 25% on the zoom buttons', async () => {
		render(Harness, { props: { pageCount: 1 } });
		await fireEvent.click(screen.getByLabelText('Zoom in'));
		expect(zoomLabel()).toHaveTextContent('125%');
		await fireEvent.click(screen.getByLabelText('Zoom out'));
		expect(zoomLabel()).toHaveTextContent('100%');
	});

	it('clamps at 300%', async () => {
		render(Harness, { props: { pageCount: 1, zoom: 3 } });
		await fireEvent.click(screen.getByLabelText('Zoom in'));
		expect(zoomLabel()).toHaveTextContent('300%');
	});

	it('clamps at 50%', async () => {
		render(Harness, { props: { pageCount: 1, zoom: 0.5 } });
		await fireEvent.click(screen.getByLabelText('Zoom out'));
		expect(zoomLabel()).toHaveTextContent('50%');
	});

	it('responds to the +/-/0 keys', async () => {
		render(Harness, { props: { pageCount: 1 } });
		await fireEvent.keyDown(stage(), { key: '+' });
		expect(zoomLabel()).toHaveTextContent('125%');
		await fireEvent.keyDown(stage(), { key: '-' });
		await fireEvent.keyDown(stage(), { key: '-' });
		expect(zoomLabel()).toHaveTextContent('75%');
		await fireEvent.keyDown(stage(), { key: '0' });
		expect(zoomLabel()).toHaveTextContent('100%');
	});

	it('only zooms on a ctrl/cmd wheel, not a plain scroll', async () => {
		render(Harness, { props: { pageCount: 1 } });
		await fireEvent.wheel(stage(), { deltaY: -100 });
		expect(zoomLabel()).toHaveTextContent('100%');
		await fireEvent.wheel(stage(), { deltaY: -100, ctrlKey: true });
		expect(zoomLabel()).toHaveTextContent('125%');
	});
});

describe('PageCanvas — focus and the way back', () => {
	const region: PageCanvasRegion = {
		id: 'r1',
		page: 1,
		box: { x: 0.1, y: 0.1, w: 0.5, h: 0.05 },
		label: 'Eton 225g 1.49'
	};

	it('shows no "Whole page" affordance until a region is focused', () => {
		render(Harness, { props: { pageCount: 1, regions: [region] } });
		expect(screen.queryByText('Whole page')).not.toBeInTheDocument();
	});

	it('shows "Whole page" once a region on the current page is focused', () => {
		render(Harness, { props: { pageCount: 1, regions: [region], focusedRegionId: 'r1' } });
		expect(screen.getByText('Whole page')).toBeInTheDocument();
	});

	// Focusing a region on ANOTHER page turns to it rather than doing nothing
	// — see "PageCanvas — focusing a region turns to its own page" below.

	it('clears the focus and returns to the pager on "Whole page"', async () => {
		render(Harness, { props: { pageCount: 2, regions: [region], focusedRegionId: 'r1' } });
		expect(screen.getByText('Whole page')).toBeInTheDocument();
		await fireEvent.click(screen.getByText('Whole page'));
		expect(screen.queryByText('Whole page')).not.toBeInTheDocument();
		expect(pageLabel()).toHaveTextContent('1 / 2');
	});

	it('clears the focus on Escape', async () => {
		render(Harness, { props: { pageCount: 1, regions: [region], focusedRegionId: 'r1' } });
		await fireEvent.keyDown(stage(), { key: 'Escape' });
		expect(screen.queryByText('Whole page')).not.toBeInTheDocument();
	});

	it('clears the focus on navigating to another page', async () => {
		// The pager itself is not on screen while focused (the "Whole page"
		// affordance takes its place), so paging happens by keyboard here.
		render(Harness, { props: { pageCount: 2, regions: [region], focusedRegionId: 'r1' } });
		await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
		expect(screen.queryByText('Whole page')).not.toBeInTheDocument();
		expect(pageLabel()).toHaveTextContent('2 / 2');
	});
});

describe('PageCanvas — focusing a region turns to its own page', () => {
	const onPageOne: PageCanvasRegion = {
		id: 'p1',
		page: 1,
		box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
		label: 'On page 1'
	};
	const onPageTwo: PageCanvasRegion = {
		id: 'p2',
		page: 2,
		box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
		label: 'On page 2'
	};

	it('turns to a focused region\'s own page, from elsewhere', () => {
		render(Harness, {
			props: { pageCount: 2, regions: [onPageOne, onPageTwo], focusedRegionId: 'p2' }
		});
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 2');
		expect(screen.getByText('Whole page')).toBeInTheDocument();
	});

	it('turns pages again when the focus moves to a region on a further page', async () => {
		const { rerender } = render(Harness, {
			props: { pageCount: 2, regions: [onPageOne, onPageTwo], focusedRegionId: 'p1' }
		});
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 1');
		await rerender({ focusedRegionId: 'p2' });
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 2');
	});

	it('does NOT turn the page for a hovered (active, not focused) region elsewhere', () => {
		render(Harness, {
			props: { pageCount: 2, regions: [onPageOne, onPageTwo], activeRegionId: 'p2' }
		});
		expect(screen.getByTestId('page-content')).toHaveTextContent('page 1');
	});
});

describe('PageCanvas — panning past 100%', () => {
	// jsdom lays nothing out, so the actual scroll behaviour (the reason this
	// exists) is proved in harness/drive.mjs; this is the cheap structural
	// regression guard: the controls must not be descendants of the
	// scrollable region, or they would scroll away with it.
	it('keeps the pager and zoom controls outside the scrollable stage', () => {
		render(Harness, { props: { pageCount: 2 } });
		const scroller = document.querySelector('.overflow-auto');
		expect(scroller).not.toBeNull();
		expect(scroller?.contains(screen.getByLabelText('Zoom in'))).toBe(false);
		expect(scroller?.contains(screen.getByLabelText('Next page'))).toBe(false);
	});

	it('keeps "Whole page" outside the scrollable stage too', () => {
		render(Harness, {
			props: {
				pageCount: 1,
				regions: [
					{ id: 'r1', page: 1, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 } }
				],
				focusedRegionId: 'r1'
			}
		});
		const scroller = document.querySelector('.overflow-auto');
		expect(scroller?.contains(screen.getByText('Whole page'))).toBe(false);
	});
});
