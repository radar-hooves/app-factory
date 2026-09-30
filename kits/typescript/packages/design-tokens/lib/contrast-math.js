/**
 * OKLCH -> linear sRGB -> WCAG relative luminance -> contrast ratio.
 *
 * Standard OKLab conversion matrices (Björn Ottosson,
 * https://bottosson.github.io/posts/oklab/), the same ones every browser and
 * `culori`-class library uses. Sanity-checked against the trivial cases
 * (oklch(1 0 0) -> #ffffff, oklch(0 0 0) -> #000000, white/black -> 21:1)
 * and cross-checked against design-system#13's own Chromium-measured ratios
 * (3.95 / 3.78 / 3.62 / 3.41 for the pre-fix light-mode value) before use.
 */

/** Parse `oklch(L C H)` (the only shape this package's tokens use) into [L, C, H]. */
export function parseOklch(value) {
	const match = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
	if (!match) throw new Error(`not an oklch(L C H) value: ${value}`);
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function oklchToLinearSrgb(L, C, Hdeg) {
	const hRad = (Hdeg * Math.PI) / 180;
	const a = C * Math.cos(hRad);
	const b = C * Math.sin(hRad);

	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;

	const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	return [r, g, bl];
}

function relativeLuminance([r, g, b]) {
	const clamp = (x) => Math.min(1, Math.max(0, x));
	return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

/** WCAG contrast ratio between two oklch(L C H) strings. */
export function contrastRatio(oklchTextA, oklchTextB) {
	const lumA = relativeLuminance(oklchToLinearSrgb(...parseOklch(oklchTextA)));
	const lumB = relativeLuminance(oklchToLinearSrgb(...parseOklch(oklchTextB)));
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
}
