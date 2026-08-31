/**
 * Style Dictionary v4 configuration.
 *
 * Spec refs:
 *   W3C DTCG 2025.10  https://design-tokens.github.io/community-group/format/
 *   Style Dictionary v4  https://styledictionary.com/reference/config/
 *   Tailwind v4 @theme   https://tailwindcss.com/docs/theme
 *   shadcn-svelte Tailwind v4 mapping  https://shadcn-svelte.com/docs/theming
 *
 * Three platforms:
 *   css → dist/tokens.css    (:root light tokens + .dark overrides, --ds-* namespace)
 *   js  → dist/tokens.js + dist/tokens.d.ts  (DS_* constants)
 *   tw  → dist/tokens.tw.css (two @theme blocks for Tailwind v4, every semantic
 *                             group except THEME_EXCLUDED_NAMESPACES below:
 *                             colour registers `@theme inline` so a scoped
 *                             subtree or a scoped .dark wrapper can re-theme
 *                             it — see the css/tailwind-v4-theme format below
 *                             and design-system#8; radius/text/font stay
 *                             plain `@theme`)
 *
 * Emitted-name contract (what every consuming app relies on):
 *   semantic.colour.X.{light,dark} → --ds-color-X in :root and .dark
 *   semantic.radius.X              → --ds-radius-X
 *   semantic.spacing.X             → --ds-spacing-X
 *   semantic.text.X                → --ds-text-X
 *   semantic.font.X                → --ds-font-X
 *   semantic.font-size.X           → --ds-font-size-X (never a Tailwind theme key)
 *   palette.*                      → --ds-palette-* (primitives; not for components)
 *   meta.*                         → omitted from CSS output
 */

import StyleDictionary from 'style-dictionary';
import { fileHeader } from 'style-dictionary/utils';
import { readFileSync } from 'node:fs';
import { contrastRatio, parseOklch } from './lib/contrast-math.js';

/**
 * Normalise a token path to its public --ds-* name:
 * drop the 'semantic' level, spell 'colour' as 'color' (CSS convention),
 * and drop a trailing 'light'/'dark' mode key (the mode is carried by
 * :root vs .dark, not by the property name).
 *
 * The mode-split applies to palette primitives too, BY DESIGN: a palette
 * pair like palette.primary.{light,dark} emits one --ds-palette-primary
 * that follows the mode, exactly like the semantic tokens. The JS constants
 * keep both values (DS_PALETTE_PRIMARY_LIGHT / _DARK) for consumers that
 * need a specific mode's value.
 */
const dsName = (parts) => {
	const trimmed = parts[0] === 'semantic' ? parts.slice(1) : parts;
	const mapped = trimmed.map((p) => (p === 'colour' ? 'color' : p));
	const last = mapped[mapped.length - 1];
	const mode = last === 'light' || last === 'dark' ? last : null;
	return {
		name: (mode ? mapped.slice(0, -1) : mapped).join('-'),
		mode
	};
};

/** Depth-first walk over the resolved token tree, yielding [pathParts, node]. */
const leaves = (tokens, path = []) => {
	const out = [];
	for (const [key, node] of Object.entries(tokens)) {
		if (key.startsWith('$') || (path.length === 0 && key === 'meta')) continue;
		if (node && node.$value !== undefined) out.push([[...path, key], node]);
		else if (node && typeof node === 'object') out.push(...leaves(node, [...path, key]));
	}
	return out;
};

// ---------------------------------------------------------------------------
// Custom format: scoped CSS custom properties with .dark overrides
// ---------------------------------------------------------------------------
StyleDictionary.registerFormat({
	name: 'css/ds-variables',
	format: async ({ dictionary, file }) => {
		const header = await fileHeader({ file });
		const rootLines = [];
		const darkLines = [];

		for (const [parts, node] of leaves(dictionary.tokens)) {
			const { name, mode } = dsName(parts);
			const line = `  --ds-${name}: ${node.$value};`;
			if (mode === 'dark') darkLines.push(line);
			else rootLines.push(line);
		}

		return `${header}:root {\n${rootLines.join('\n')}\n}\n\n.dark {\n${darkLines.join('\n')}\n}\n`;
	}
});

// ---------------------------------------------------------------------------
// Custom format: Tailwind v4 @theme block
// ---------------------------------------------------------------------------

/**
 * Namespace prefixes this package must never register in @theme — checked
 * against the FULL derived name (`prefix` itself, or `prefix-` as a leading
 * segment run), not just its first hyphen-split segment: `font-size` and
 * `font` share a first segment, and a first-segment-only check would either
 * miss `font-size-base` or wrongly also exclude `font-display`/`font-body`/
 * `font-code`.
 *
 * spacing: Tailwind resolves the sizing utilities (w-*, max-w-*, min-w-*,
 * basis-*) against --spacing-* BEFORE --container-*, so a named --spacing-<key>
 * whose key also exists on the container scale (xs…7xl) silently rewrites them
 * — max-w-2xl drops from 42rem to the 3rem spacing value, collapsing every
 * shadcn-svelte dialogue, sheet, and tooltip. Our named scale is exactly
 * xs…2xl, so every key collides, and every value is already reachable on the
 * numeric scale anyway (--ds-spacing-md = 1rem = p-4).
 *
 * The --ds-spacing-* custom properties in tokens.css are unaffected: they stay
 * the way to consume the named rhythm from hand-written CSS.
 *
 * font-size: --ds-font-size-base is a root-element override point an app
 * consumes directly (`html { font-size: var(--ds-font-size-base) }`), never a
 * Tailwind utility. Left unexcluded it would still collide: Tailwind's
 * font-family utilities are generated from any `--font-<name>` theme key, so
 * `--font-size-base` would register a nonsensical `.font-size-base { font-family: … }`
 * utility Tailwind can't tell apart from a real family alias.
 *
 * Guarded by test/tailwind-namespace.test.js, which compiles real Tailwind and
 * asserts the sizing scale means the same with and without this package.
 */
const THEME_EXCLUDED_NAMESPACES = new Set(['spacing', 'font-size']);

/** Whether `name` falls under one of `THEME_EXCLUDED_NAMESPACES`. */
const isThemeExcluded = (name) =>
	[...THEME_EXCLUDED_NAMESPACES].some((prefix) => name === prefix || name.startsWith(`${prefix}-`));

/**
 * Colour registration is `@theme inline`; radius/text/font stay plain `@theme`
 * (design-system#8).
 *
 * A plain `@theme { --color-x: var(--ds-color-x); }` registers `--color-x` as
 * a REAL custom property, declared once at `:root`. Tailwind's generated
 * utility then reads `var(--color-x)`, not `var(--ds-color-x)` directly — two
 * levels of indirection. CSS resolves that indirection ONCE, at the element
 * where `--color-x` is declared (`:root`), and inherits the already-resolved
 * result unchanged from there. A `.dark` class or a `--ds-color-x` override
 * on anything BELOW `:root` never reaches it: `--color-x`'s value was fixed
 * before the override existed. `@theme inline` collapses the indirection —
 * the utility reads `var(--ds-color-x)` directly — so the live token, not a
 * frozen alias, is what the cascade re-resolves at every element. Root-level
 * `.dark` and root-level overrides were never affected (both scopes resolve
 * at the same element `:root` either way); only a SCOPED subtree wrapper was
 * broken, which is what #8 reports.
 *
 * This trades away `--color-x`-by-name override (never documented — the
 * README's only documented lever is `--ds-color-*`) for a working scoped
 * lever. Radius/text/font stay plain `@theme`: the package's own binding
 * constraints (README §"Binding constraints") make per-app radius/font
 * override unsanctioned already, so there is nothing to gain by moving them
 * and no reason to touch their (working) by-name lever.
 */
StyleDictionary.registerFormat({
	name: 'css/tailwind-v4-theme',
	format: async ({ dictionary, file }) => {
		const header = await fileHeader({ file });
		const colourLines = [];
		const otherLines = [];
		const seen = new Set();

		for (const [parts] of leaves(dictionary.tokens)) {
			if (parts[0] !== 'semantic') continue; // palette primitives stay out of @theme
			const { name } = dsName(parts);
			if (isThemeExcluded(name)) continue;
			if (seen.has(name)) continue; // light/dark pairs collapse to one alias
			seen.add(name);

			// Alias the live --ds-* custom property so .dark toggling and a scoped
			// subtree override both flow through @theme utilities automatically.
			// The normalised name already carries its Tailwind namespace
			// (color-*, radius-*, text-*, font-*).
			const line = `  --${name}: var(--ds-${name});`;
			if (parts[1] === 'colour') colourLines.push(line);
			else otherLines.push(line);
		}

		// Default Tailwind family hooks so font-sans / font-serif / font-mono
		// resolve to the binding families without per-app wiring.
		otherLines.push('  --font-sans: var(--ds-font-body);');
		otherLines.push('  --font-serif: var(--ds-font-display);');
		otherLines.push('  --font-mono: var(--ds-font-code);');

		return `${header}@theme {\n${otherLines.join('\n')}\n}\n\n@theme inline {\n${colourLines.join('\n')}\n}\n`;
	}
});

// ---------------------------------------------------------------------------
// Custom formats: JS constants + type declarations (DS_* names)
// ---------------------------------------------------------------------------
const constEntries = (dictionary) =>
	leaves(dictionary.tokens).map(([parts, node]) => {
		const trimmed = parts[0] === 'semantic' ? parts.slice(1) : parts;
		const mapped = trimmed.map((p) => (p === 'colour' ? 'color' : p));
		const constName = `DS_${mapped.join('_').toUpperCase().replace(/-/g, '_')}`;
		return [constName, node.$value];
	});

StyleDictionary.registerFormat({
	name: 'js/ds-constants',
	format: async ({ dictionary, file }) => {
		const header = await fileHeader({ file });
		const lines = constEntries(dictionary).map(
			([name, value]) => `export const ${name} = ${JSON.stringify(value)};`
		);
		return `${header}// Source: tokens/tokens.tokens.json\n\n${lines.join('\n')}\n`;
	}
});

StyleDictionary.registerFormat({
	name: 'ts/ds-declarations',
	format: async ({ dictionary, file }) => {
		const header = await fileHeader({ file });
		const lines = constEntries(dictionary).map(
			([name, value]) => `export declare const ${name}: ${JSON.stringify(value)};`
		);
		return `${header}${lines.join('\n')}\n`;
	}
});

// ---------------------------------------------------------------------------
// Custom formats: the palette catalogue (design-system#25)
// ---------------------------------------------------------------------------

/**
 * The catalogue is a set of named personalities an app adopts wholesale. It is
 * deliberately NOT a second token source: a palette declares an accent and a
 * TONE (a hue plus a per-mode chroma scale), and every surface it emits is
 * computed here from the ladder in `tokens.tokens.json`. There is no field for
 * a lightness, so the ladder's L steps — which carry every contrast guarantee
 * this package makes — cannot be reached from a palette at all, and a palette
 * cannot drift from the ladder because it is projected through it on each
 * build.
 *
 * The status vocabulary is invariant across palettes by the same reasoning
 * inverted: a warning has to read as a warning in every app, so no palette may
 * touch it.
 */
const PALETTES = JSON.parse(readFileSync(new URL('tokens/palettes.json', import.meta.url), 'utf8'));

/**
 * Which semantic colour each neutral ladder step feeds, per mode. Mirrors
 * `semantic.colour.*` in the token file; asserted against it by
 * `test/palettes.test.js`, so a token rename cannot leave this list stale.
 */
const NEUTRAL_SURFACES = {
	light: {
		background: 'neutral.50',
		foreground: 'neutral.800',
		'surface-1': 'neutral.100',
		'surface-2': 'neutral.25',
		'surface-3': 'neutral.0',
		'muted-foreground': 'neutral.500',
		border: 'neutral.300',
		'border-strong': 'neutral.400'
	},
	dark: {
		background: 'neutral.850',
		foreground: 'neutral.990',
		'surface-1': 'neutral.900',
		'surface-2': 'neutral.920',
		'surface-3': 'neutral.940',
		'muted-foreground': 'neutral.970',
		border: 'neutral.950',
		'border-strong': 'neutral.960'
	}
};

const OKLCH = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/;

/** The raw ladder value at `palette.neutral.<step>`, straight from the source. */
function ladderStep(tokens, ref) {
	const node = ref.split('.').reduce((n, k) => n?.[k], tokens.palette);
	const parsed = OKLCH.exec(node?.$value ?? '');
	if (!parsed) throw new Error(`palette.${ref} is not a plain oklch() value`);
	return { l: +parsed[1], c: +parsed[2], h: +parsed[3] };
}

/**
 * Re-tone one ladder step: keep its LIGHTNESS exactly, scale its chroma, adopt
 * the palette's hue.
 *
 * A step at chroma 0 stays at chroma 0 and so keeps no hue of its own. That is
 * `surface-3` in light mode — `neutral.0`, named "absolute white" in the token
 * source — and leaving it alone is the point rather than an oversight: it is
 * what gives a warm-surface palette its paper-on-desk read, an untinted
 * overlay sitting on a tinted ground. It was `surface-2` until #17 lifted the
 * light canvas off near-white, which needed a rung of its own between the card
 * and absolute white.
 */
function retone(step, tone, mode) {
	const c = step.c * tone.chromaScale[mode];
	const h = c === 0 ? 0 : tone.hue;
	return `oklch(${step.l.toFixed(3)} ${c.toFixed(4)} ${h})`;
}

/**
 * The label colour for an accent: near-ink or near-white at the accent's own
 * hue, whichever measures better against it.
 *
 * DERIVED rather than declared, which is the whole reason a palette carries no
 * `foreground` field. The catalogue was lifted from a showcase where thirteen
 * of twenty accent pairs sat below the 4.5:1 AA fill floor — papyrus-gold at
 * 2.20:1, nile-teal 2.63:1, scribes-amber 2.71:1, each pairing a light accent
 * with a near-white label. Deriving here makes that shape unrepresentable
 * instead of merely caught: there is no field an author could put a bad value
 * in. `test/palettes.test.js` still asserts the floor, because "unrepresentable"
 * is a claim about this function and wants its own check.
 *
 * The two candidates mirror `palette.primary.foreground-{light,dark}` in the
 * token source, so a catalogued accent lands on the same pair shape a
 * hand-picked one does.
 */
function accentForeground(primary) {
	const [, , hue] = parseOklch(primary);
	const h = hue.toFixed(1);
	const onInk = `oklch(0.200 0.030 ${h})`;
	const onPaper = `oklch(0.990 0.005 ${h})`;
	return contrastRatio(primary, onPaper) >= contrastRatio(primary, onInk) ? onPaper : onInk;
}

/** Every `--ds-color-*` declaration one palette makes, in one mode. */
function paletteDeclarations(tokens, palette, mode) {
	const lines = [];
	for (const [name, ref] of Object.entries(NEUTRAL_SURFACES[mode])) {
		lines.push(`  --ds-color-${name}: ${retone(ladderStep(tokens, ref), palette.tone, mode)};`);
	}
	const { primary } = palette.accent[mode];
	lines.push(`  --ds-color-primary: ${primary};`);
	lines.push(`  --ds-color-primary-foreground: ${accentForeground(primary)};`);
	// `ring` follows primary in the token source; a palette must not split them.
	lines.push(`  --ds-color-ring: ${primary};`);
	return lines.join('\n');
}

StyleDictionary.registerFormat({
	name: 'css/ds-palettes',
	format: async ({ dictionary, file }) => {
		const header = await fileHeader({ file });
		const blocks = [];

		for (const [name, palette] of Object.entries(PALETTES.palettes)) {
			// `:root[data-ds-palette=…]` rather than a bare attribute selector, so
			// the block outranks tokens.css's own `:root` (0,1,0 vs 0,2,0) whatever
			// order an app imports the two stylesheets in. A bare `[data-ds-palette]`
			// ties with `:root` on specificity and would be decided by source order
			// alone — which fails silently and only in LIGHT mode, since the dark
			// block carries an extra `.dark` class and wins either way. A palette
			// that applies in one mode and not the other is exactly the shape of
			// dead affordance `theme-coverage.test.ts` calls worse than a missing
			// key.
			blocks.push(
				`/* ${palette.title} — ${palette.strategy}; ${palette.useCase} */\n` +
					`:root[data-ds-palette='${name}'] {\n${paletteDeclarations(dictionary.tokens, palette, 'light')}\n}`
			);
			blocks.push(
				`:root[data-ds-palette='${name}'].dark {\n${paletteDeclarations(dictionary.tokens, palette, 'dark')}\n}`
			);
		}

		return `${header}${blocks.join('\n\n')}\n`;
	}
});

/** The catalogue as data, so a consumer (and the browser gate) can iterate it
 *  rather than re-parsing the emitted CSS. */
const paletteMeta = () =>
	Object.entries(PALETTES.palettes).map(([name, p]) => ({
		name,
		title: p.title,
		strategy: p.strategy,
		useCase: p.useCase
	}));

StyleDictionary.registerFormat({
	name: 'js/ds-palettes',
	format: async ({ file }) => {
		const header = await fileHeader({ file });
		return (
			`${header}// Source: tokens/palettes.json\n\n` +
			`export const DS_PALETTES = ${JSON.stringify(paletteMeta(), null, 2)};\n\n` +
			`export const DS_PALETTE_NAMES = DS_PALETTES.map((p) => p.name);\n`
		);
	}
});

StyleDictionary.registerFormat({
	name: 'ts/ds-palettes',
	format: async ({ file }) => {
		const header = await fileHeader({ file });
		return (
			`${header}export interface DsPalette {\n` +
			`  name: string;\n  title: string;\n  strategy: string;\n  useCase: string;\n}\n\n` +
			`export declare const DS_PALETTES: DsPalette[];\n` +
			`export declare const DS_PALETTE_NAMES: string[];\n`
		);
	}
});

// ---------------------------------------------------------------------------
// Style Dictionary configuration
// ---------------------------------------------------------------------------
export default {
	source: ['tokens/tokens.tokens.json'],

	platforms: {
		css: {
			transformGroup: 'css',
			buildPath: 'dist/',
			files: [
				{ destination: 'tokens.css', format: 'css/ds-variables' },
				// Projected through the same ladder this platform emits, so the
				// catalogue cannot drift from it (design-system#25).
				{ destination: 'palettes.css', format: 'css/ds-palettes' }
			]
		},

		tw: {
			transformGroup: 'css',
			buildPath: 'dist/',
			files: [
				{
					destination: 'tokens.tw.css',
					format: 'css/tailwind-v4-theme'
				}
			]
		},

		js: {
			transformGroup: 'js',
			buildPath: 'dist/',
			files: [
				{ destination: 'tokens.js', format: 'js/ds-constants' },
				{
					destination: 'tokens.d.ts',
					format: 'ts/ds-declarations'
				},
				{ destination: 'palettes.js', format: 'js/ds-palettes' },
				{ destination: 'palettes.d.ts', format: 'ts/ds-palettes' }
			]
		}
	}
};
