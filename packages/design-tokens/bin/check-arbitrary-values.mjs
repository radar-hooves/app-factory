#!/usr/bin/env node
/**
 * Colour and size literals must not be hand-written into an arbitrary Tailwind
 * value. The token layer is the only place a value is decided.
 *
 * This ships from the package on purpose. It replaces an inline `grep` that
 * lived in the shared frontend-CI reusable workflow, where a fix reached a
 * consumer only when someone edited master-project — the same
 * fix-it-in-nine-places problem the packages exist to end. Here, a consumer
 * picks the gate up with the version bump it already takes.
 *
 * What the grep could not see, and why each hole is closed:
 *
 *   arbitrary properties   `[color:#f00]` has no `-` before the bracket, so the
 *                          `-\[` anchor missed the whole idiomatic v4 form.
 *   `ch`                   the unit list was px/rem/em only, so every
 *                          `max-w-[70ch]` passed — the exact value `.ds-measure`
 *                          exists to supply, hand-written in four apps.
 *   `color-mix()`          not in the function list, so a hand-rolled tint
 *                          ladder (4%/5%/10%/12%/16% in one app) read as clean.
 *   viewport units         `h-[55vh]`, `max-h-[85dvh]` and friends, unlisted.
 *   `.5rem` / `-4px`       the number had to start with a digit and be positive.
 *   path exemption         `grep -v 'lib/components/ui/'` filtered on the whole
 *                          matching LINE, so any line merely MENTIONING that
 *                          path was exempted wherever it lived.
 *
 * Failure mode, deliberately: this exits non-zero when it cannot do its job —
 * no source root, or nothing scanned — and prints the file count when it
 * passes. A gate that is structurally unable to act must not report that there
 * was nothing to act on (rules-library/core/verification.md).
 *
 * Usage: ds-check-arbitrary-values [source-root ...]   (default: src)
 */

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

/** Extensions that can carry a Tailwind class. `.css` included for `@apply`. */
const SCANNED = /\.(svelte|ts|js|mjs|css|html)$/;

/** Never descend into these. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', '.svelte-kit', '.git']);

/**
 * Vendored shadcn primitives are exempt: they are upstream's source, restyled
 * through the token layer rather than authored here. Matched on the PATH, which
 * is what the grep form got wrong.
 */
const EXEMPT_PATH = `lib${sep}components${sep}ui${sep}`;

/** Colour notations. A literal in any of these bypasses the palette entirely. */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix)\(/;

/**
 * The CSS named colours. `bg-[red]` is a hand-written colour exactly as
 * `bg-[#ff0000]` is, and it is the likelier of the two to be typed — but it is
 * a bare word, so no notation pattern can see it.
 *
 * `transparent`, `currentColor` and the CSS-wide keywords are NOT here: they
 * name a behaviour rather than pick a colour, and an app is right to use them.
 */
const NAMED_COLOURS = new Set(
	`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
	 blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
	 crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
	 darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
	 darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
	 dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
	 gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
	 lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
	 lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
	 lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
	 magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
	 mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
	 mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
	 palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
	 powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
	 seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
	 steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
	 yellowgreen`.split(/\s+/)
);

/**
 * Lengths the token scale can actually express — absolute and font-relative.
 *
 * Viewport, container-query and line-height units are deliberately ABSENT.
 * There is no token for `85vh` or `50cqw`, so flagging one reports a
 * divergence whose only advice is "raise an issue", and a gate that cannot be
 * satisfied is one an app turns off. The divergence is still real — one app
 * carries 85vh, 85dvh, 70vh, 60vh, 58vh, 56vh and 55vh for the same job — but
 * it belongs in a token proposal, not in a build failure.
 */
const LENGTH = /(?:^|[^\w.-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|pt|pc|ch|ex|cap|ic|cm|mm|in|q)\b/i;

/**
 * A term the scale cannot replace, which makes every length beside it
 * structural rather than a spacing choice: a grid track, or a length computed
 * against the viewport, the container or the reader's own settings.
 *
 * This is the test rather than "does it contain a function call", because that
 * form exempted `p-[calc(13px)]` and `gap-[min(7px,7px)]` — wrapping a literal
 * in `min()` was a one-character bypass — while still failing
 * `grid-cols-[16rem_1fr]`, a bare grid template with no function in it at all.
 */
const UNEXPRESSIBLE =
	/\b(?:minmax|repeat)\(|\d(?:fr|%)|\b(?:auto|min-content|max-content|stretch|fit-content)\b|\d(?:v[hwib]|vmin|vmax|[dsl]v[hwib]|[dsl]vmin|[dsl]vmax|cq[whibs]|cqmin|cqmax|lh|rlh)\b/i;

const COLOUR_ADVICE =
	'use a semantic colour (bg-card, text-muted-foreground) or a --ds-color-* token';
const MEASURE = /(?:\d+\.?\d*|\.\d+)(?:ch|ex)\b/i;

/** What to reach for instead of this value. */
function adviceFor(residue, colour) {
	if (colour) return COLOUR_ADVICE;
	if (MEASURE.test(residue)) {
		return 'a reading measure is `.ds-measure` with data-measure="prose" (@poodle64/ui >= 2026.8.17)';
	}
	return 'use the spacing/size scale (p-4, text-sm, gap-2) rather than a literal';
}

/**
 * Every arbitrary value in `text`, as `{ index, body }`.
 *
 * Written as a scanner rather than a regex because the body nests: the
 * `color-mix(in oklch, var(--primary) 10%, transparent)` case that slipped past
 * the grep has both a comma and parentheses inside the brackets.
 */
function arbitraryValues(text) {
	const found = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== '[') continue;
		// A Tailwind arbitrary value follows a utility (`text-[`) or opens an
		// arbitrary property (`[color:`). Anything else — an index, an array
		// literal, a route parameter — is not ours.
		const before = i > 0 ? text[i - 1] : '';
		const isUtility = before === '-';
		let depth = 1;
		let j = i + 1;
		for (; j < text.length && depth > 0; j++) {
			if (text[j] === '[') depth++;
			else if (text[j] === ']') depth--;
			else if (text[j] === '\n') break;
		}
		if (depth !== 0) continue;
		const body = text.slice(i + 1, j - 1);
		const isProperty = /^[a-zA-Z-]+:/.test(body);
		if (!isUtility && !isProperty) continue;
		// A `:` straight after the closing bracket makes this a VARIANT, not a
		// value: `max-[600px]:hidden` is a media condition and `[&>*]:mt-2` a
		// selector. Flagging the first told an author to reach for the spacing
		// scale, which cannot express a breakpoint.
		if (text[j] === ':') {
			i = j - 1;
			continue;
		}
		found.push({ index: i, body });
		i = j - 1;
	}
	return found;
}

/** The line number `index` falls on, 1-based. */
function lineOf(text, index) {
	let line = 1;
	for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
	return line;
}

/** Violations in one file's text, as `{ line, body, advice }`. */
export function violationsIn(text) {
	const out = [];
	for (const { index, body } of arbitraryValues(text)) {
		// Tailwind writes a space as `_` inside an arbitrary value.
		const value = body.replace(/^[a-zA-Z-]+:/, '').replaceAll('_', ' ').trim();

		// Strike out every custom-property REFERENCE, then judge what survives.
		// Treating `var(...)` as wholesale proof of the token layer let a
		// literal ride in the fallback slot — `bg-[var(--brand,#ff0000)]` and
		// `max-w-[var(--m,70ch)]` both read as clean — and the fallback is
		// exactly where a value hides when the token does not exist yet.
		const residue = value.replace(/var\(\s*--[\w-]+/g, '').replace(/^--[\w-]+$/, '');

		const colour =
			COLOUR.test(residue) || NAMED_COLOURS.has(residue.trim().toLowerCase());
		const length = LENGTH.test(residue) && !UNEXPRESSIBLE.test(residue);
		if (!colour && !length) continue;
		out.push({ line: lineOf(text, index), body, advice: adviceFor(residue, colour) });
	}
	return out;
}

/** Whether `path` resolves to a directory; false for a broken link. */
function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** Every scannable file under `root`, depth-first. */
function filesUnder(root, acc = []) {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		// isDirectory() is false for a SYMLINK to one, so a linked-in source
		// tree would have been skipped in silence rather than scanned.
		const directory = entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(path));
		if (directory) {
			if (!SKIPPED_DIRS.has(entry.name)) filesUnder(path, acc);
		} else if (SCANNED.test(entry.name)) {
			acc.push(path);
		}
	}
	return acc;
}

function main(roots) {
	const failures = [];
	// `discovered` answers "could this gate have acted?"; `scanned` answers "what
	// did it read?". They differ only by the vendored exemption, and conflating
	// them makes an all-vendored tree indistinguishable from a broken invocation.
	let discovered = 0;
	let scanned = 0;

	for (const root of roots) {
		let stats;
		try {
			stats = statSync(root);
		} catch {
			console.error(`ds-check-arbitrary-values: no such source root: ${root}`);
			console.error(`  cwd:   ${process.cwd()}`);
			return 1;
		}
		if (!stats.isDirectory()) {
			console.error(`ds-check-arbitrary-values: not a directory: ${root}`);
			return 1;
		}
		for (const file of filesUnder(root)) {
			discovered++;
			if (file.includes(EXEMPT_PATH)) continue;
			scanned++;
			for (const hit of violationsIn(readFileSync(file, 'utf8'))) {
				failures.push({ file: relative(process.cwd(), file), ...hit });
			}
		}
	}

	// A gate that found nothing to read has not passed; it has failed to run.
	if (discovered === 0) {
		console.error(
			`ds-check-arbitrary-values: found no .svelte/.ts/.js/.css under ${roots.join(', ')} —` +
				' the gate did not run'
		);
		return 1;
	}

	if (failures.length > 0) {
		console.error(`\nHand-written colour or size literals (${failures.length}):\n`);
		for (const { file, line, body, advice } of failures) {
			console.error(`  ${file}:${line}  [${body}]`);
			if (advice) console.error(`    ${advice}`);
		}
		console.error(
			'\nAn app picks a palette and an accent; every other value comes from the token layer.\n' +
				'This gate sees arbitrary values only. It does NOT see Tailwind\'s own default\n' +
				'palette (bg-stone-50, text-black), inline style attributes, or a viewport length\n' +
				'the scale cannot express — a pass is not a clean bill of health.\n'
		);
		return 1;
	}

	const exempt = discovered - scanned;
	console.log(
		`arbitrary values: ${scanned} files scanned` +
			(exempt > 0 ? ` (${exempt} vendored, exempt)` : '') +
			', no hand-written colour or size literals'
	);
	return 0;
}

// Importable for the test suite; only a direct CLI invocation exits.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const roots = process.argv.slice(2);
	process.exit(main(roots.length > 0 ? roots : ['src']));
}

export { main };
