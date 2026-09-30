/**
 * The shared evidence vocabulary — plain shapes a consuming app maps a
 * machine reading's own coordinates into. This package holds no image
 * decoder, no PDF renderer and no OCR geometry; a region's box is a fraction
 * of the page (0–1 each way), never a pixel tied to one raster's resolution,
 * so the same shape describes an A4 page and a phone-scanned receipt alike.
 */

/** One outlined place on a page — evidence for something the app read there. */
export interface PageCanvasRegion {
	/** Stable identity: bind `activeRegionId` / `focusedRegionId` to this. */
	id: string;
	/** 1-based page number this region belongs to. */
	page: number;
	/** The region's box, in fractions (0–1) of the page's own width/height. */
	box: { x: number; y: number; w: number; h: number };
	/** A few degrees of tilt, for a phone-scanned page that slopes. */
	rotateDeg?: number;
	/** Shown beside the outlined region where there is room, above it where there is not. */
	label?: string;
}

/** What the canvas hands the `page` snippet for one render. */
export interface PageCanvasRenderInfo {
	/** The box to render at, in CSS pixels; {0, 0} until the page's own size is known. */
	size: { width: number; height: number };
	/** Call once the page's intrinsic size is known (an image's onload, a PDF viewport). */
	reportSize: (width: number, height: number) => void;
}
