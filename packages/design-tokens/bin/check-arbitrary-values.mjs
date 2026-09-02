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
const SCANNED = /\.(svelte|ts|js|mjs|css)$/;

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
 * Length notations. `%` and unitless values are NOT here: a percentage is a
 * layout proportion with no token scale behind it, so gating it would report
 * noise rather than divergence.
 */
const LENGTH = /-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|pt|ch|ex|cm|mm|in|q|v[hw]|vmin|vmax|[dsl]v[hw])\b/i;

/** Bracket content that is only a variable reference is the token layer working. */
const VARIABLE_ONLY = /^(?:var\(\s*--[\w-]+\s*(?:,[^)]*)?\)|--[\w-]+)$/;

/**
 * A layout expression: a grid template, or a length computed against something
 * the author cannot know. Its LENGTHS are exempt, because there is no token to
 * reach for instead — Tailwind has no grid-template scale, and no scale can
 * express `100dvh` minus a header. Its COLOURS are not exempt: `color-mix()` is
 * not in this list, so a hand-rolled tint is still caught.
 *
 * Gating these would report a divergence with no legal fix, and a gate that
 * cannot be satisfied is one an app turns off.
 */
const LAYOUT_EXPRESSION = /\b(?:minmax|repeat|fit-content|calc|clamp|min|max)\(/;

/**
 * What to reach for instead. Ordered: the first matching rule wins, so the
 * specific advice beats the general.
 */
const GUIDANCE = [
	[
		/(?:\d+\.?\d*|\.\d+)(?:ch|ex)\b/i,
		'a reading measure is `.ds-measure` with data-measure="prose" (@poodle64/ui >= 2026.8.17)'
	],
	[
		/(?:\d+\.?\d*|\.\d+)(?:v[hw]|vmin|vmax|[dsl]v[hw])\b/i,
		'no viewport-length token exists — if this recurs across apps, raise it on poodle64/design-system'
	],
	[COLOUR, 'use a semantic colour (bg-card, text-muted-foreground) or a --ds-color-* token'],
	[LENGTH, 'use the spacing/size scale (p-4, text-sm, gap-2) rather than a literal']
];

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
		if (VARIABLE_ONLY.test(value)) continue;
		const colour = COLOUR.test(value);
		const length = LENGTH.test(value) && !LAYOUT_EXPRESSION.test(value);
		if (!colour && !length) continue;
		const advice = GUIDANCE.find(([pattern]) => pattern.test(value))?.[1] ?? '';
		out.push({ line: lineOf(text, index), body, advice });
	}
	return out;
}

/** Every scannable file under `root`, depth-first. */
function filesUnder(root, acc = []) {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRS.has(entry.name)) filesUnder(join(root, entry.name), acc);
		} else if (SCANNED.test(entry.name)) {
			acc.push(join(root, entry.name));
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
			'\nAn app picks a palette and an accent; every other value comes from the token layer.\n'
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
