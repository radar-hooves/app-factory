import type { SVGAttributes } from 'svelte/elements';

/** A household icon's props: any SVG attribute, and `size` for its width and height (default 1em). */
export type IconProps = SVGAttributes<SVGSVGElement> & { size?: number | string };
