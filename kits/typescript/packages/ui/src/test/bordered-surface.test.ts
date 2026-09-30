/**
 * Gate: a bordered CONTENT container must declare a surface.
 *
 * The defect this exists to make loud: `<div class="rounded-md border">` around
 * a table. It draws an edge and paints nothing, so the container and every
 * child compute `rgba(0, 0, 0, 0)` and the page's own background shows straight
 * through a box sitting beside opaque cards. Measured on the deployed Console
 * at 1440x900, the document table and six ancestors were all transparent while
 * the card next to them was `oklch(1 0 0)`.
 *
 * Nothing else in this repo can see it. It type-checks, it renders, every unit
 * test passes, `theme-coverage.test.ts` is satisfied because the classes that
 * ARE there compile to real rules, and a screenshot on a plain white page looks
 * correct — the defect only appears once the container sits on a surface that
 * is not the one it should have been painting itself.
 *
 * THE RULE, as the operator states it: a container that holds CONTENT and draws
 * a border needs a surface; a control does not. A button, an input, a switch or
 * a badge takes its background from its variant or its state, and forcing one
 * on it would be the bug. So the check is scoped by element: block-level
 * content containers only, and it never looks at an interactive or inline
 * element at all.
 *
 * No baseline, no allow-list, deliberately. The sweep is clean, so a debt
 * register would be machinery for zero debt — and an allow-list is the thing a
 * future bare-bordered container gets quietly added to. If this ever needs to
 * grandfather something, that is the moment to argue the exemption in writing,
 * not to bank it.
 *
 * What it CANNOT catch is listed against LIMITS below; read it before trusting
 * a green run as proof the package has no transparent surfaces.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const libDir = join(packageRoot, 'src', 'lib');

/**
 * Block-level elements that exist to hold content. A full border on one of
 * these is a drawn box the eye reads as a surface, so it has to be one.
 *
 * Everything absent is out of scope on purpose, not by oversight: interactive
 * elements (`button`, `input`, `select`, `textarea`, `a`, `summary`) and inline
 * ones (`span`, `kbd`, `code`, `label`) are controls or chips whose background
 * legitimately comes from a variant or a state, table internals inherit their
 * surface from the container this rule already covers, and a capitalised tag is
 * a Svelte component whose own definition is scanned on its own terms.
 */
const CONTENT_CONTAINERS = new Set([
	'div',
	'section',
	'article',
	'aside',
	'main',
	'header',
	'footer',
	'nav',
	'form',
	'fieldset',
	'figure',
	'blockquote',
	'details',
	'ul',
	'ol',
	'dl',
	'table'
]);

/** `border`, `border-2`, `border-4` — a full box edge, not `border-b`/`border-t`. */
const FULL_BORDER = /^border(-\d+)?$/;

/**
 * Strip Tailwind variant prefixes (`dark:`, `hover:`, `data-[state=open]:`,
 * `[&_tr]:`, `group-hover:`) so `last:border-0` is recognised as `border-0`.
 * Prefixes are colon-separated, but a colon can also appear inside `[...]`, so
 * split at bracket depth zero only.
 */
function baseUtility(token: string): string {
	let depth = 0;
	let start = 0;
	for (let i = 0; i < token.length; i++) {
		const c = token[i];
		if (c === '[' || c === '(') depth++;
		else if (c === ']' || c === ')') depth--;
		else if (c === ':' && depth === 0) start = i + 1;
	}
	return token.slice(start);
}

/**
 * Walk an opening tag from `<` to its matching `>`, tracking quotes and brace
 * depth. A naive `<[^>]*>` truncates on the first `>` inside an expression, and
 * Svelte attributes are full of them (`onclick={() => open()}`, `{#if a > b}`),
 * which would silently shrink what this gate looks at.
 */
function readOpeningTag(src: string, from: number): { end: number; body: string } | null {
	let i = from;
	let braces = 0;
	let quote: string | null = null;
	while (i < src.length) {
		const c = src[i];
		if (quote) {
			if (c === quote) quote = null;
		} else if (c === '"' || c === "'" || c === '`') {
			quote = c;
		} else if (c === '{') {
			braces++;
		} else if (c === '}') {
			braces--;
		} else if (c === '>' && braces === 0) {
			return { end: i, body: src.slice(from, i) };
		}
		i++;
	}
	return null;
}

/**
 * Blank out `<script>`/`<style>` bodies so markup scanning never enters them.
 * Newlines survive: offsets AND line numbers have to keep lining up, or the
 * gate reports a real finding against a line that is nowhere near it.
 */
function markupOnly(src: string): string {
	return src.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, (m) =>
		m.replace(/[^\n]/g, ' ')
	);
}

/**
 * Every `tailwind-variants` class bundle defined in a file, keyed by the
 * variable it is assigned to, flattened to the union of every string literal in
 * the `tv({...})` call.
 *
 * Coarse on purpose. Alert's base carries `border` and each of its variants
 * supplies `bg-card`; the union sees the background and the element passes,
 * which is the right answer. The known cost is that a variant group where only
 * SOME arms supply a background still passes — a sharper reading would need to
 * know which groups are colour groups, which is a judgement no regex makes.
 * Recorded in LIMITS below rather than papered over.
 */
function variantBundles(src: string): Map<string, string[]> {
	const out = new Map<string, string[]>();
	const decl = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*tv\(/g;
	let m: RegExpExecArray | null;
	while ((m = decl.exec(src))) {
		const open = src.indexOf('(', m.index + m[0].length - 1);
		let depth = 0;
		let i = open;
		for (; i < src.length; i++) {
			if (src[i] === '(') depth++;
			else if (src[i] === ')' && --depth === 0) break;
		}
		out.set(m[1], stringLiterals(src.slice(open, i)));
	}
	return out;
}

/** Every single/double/backtick-quoted literal inside a fragment of source. */
function stringLiterals(fragment: string): string[] {
	return (fragment.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? []).map((s) => s.slice(1, -1));
}

/**
 * The value of an element's `class` attribute, whether it is a plain string or
 * an expression — plus the flattened text of any `tv()` bundle that expression
 * names, so a variant-driven background counts as declared.
 */
function classSources(attrs: string, bundles: Map<string, string[]>): string[] {
	const at = attrs.search(/(?:^|\s)class(?:Name)?\s*=/);
	if (at === -1) return [];
	const eq = attrs.indexOf('=', at);
	let value: string;
	if (attrs[eq + 1] === '{') {
		let depth = 0;
		let i = eq + 1;
		for (; i < attrs.length; i++) {
			if (attrs[i] === '{') depth++;
			else if (attrs[i] === '}' && --depth === 0) break;
		}
		value = attrs.slice(eq + 1, i + 1);
	} else {
		const q = attrs[eq + 1];
		const close = attrs.indexOf(q, eq + 2);
		value = attrs.slice(eq + 1, close === -1 ? undefined : close + 1);
	}
	const sources = stringLiterals(value);
	for (const [name, literals] of bundles) {
		if (new RegExp(`\\b${name}\\b`).test(value)) sources.push(...literals);
	}
	return sources;
}

export interface Offender {
	file: string;
	line: number;
	tag: string;
	classes: string;
}

export function scanFile(src: string, file: string): Offender[] {
	const bundles = variantBundles(src);
	const markup = markupOnly(src);
	const offenders: Offender[] = [];
	const tagStart = /<([a-z][a-z0-9]*)\b/g;
	let m: RegExpExecArray | null;
	while ((m = tagStart.exec(markup))) {
		const tag = m[1];
		const parsed = readOpeningTag(markup, m.index);
		if (!parsed) continue;
		tagStart.lastIndex = m.index + m[0].length;
		if (!CONTENT_CONTAINERS.has(tag)) continue;

		const tokens = classSources(parsed.body, bundles)
			.flatMap((s) => s.split(/\s+/))
			.filter(Boolean)
			.map(baseUtility);
		if (!tokens.length) continue;

		// `border-0`/`border-none` anywhere wins: it is a deliberate removal.
		if (tokens.some((t) => t === 'border-0' || t === 'border-none')) continue;
		if (!tokens.some((t) => FULL_BORDER.test(t))) continue;
		// An explicitly transparent edge is not a drawn box.
		const colours = tokens.filter((t) => /^border-(?!\d+$)/.test(t));
		if (colours.length && colours.every((t) => t.startsWith('border-transparent'))) continue;
		// A background of any kind — including an explicit `bg-transparent` — is a
		// declaration. The defect is silence, not a considered transparency.
		if (tokens.some((t) => t.startsWith('bg-'))) continue;

		offenders.push({
			file,
			line: markup.slice(0, m.index).split('\n').length,
			tag,
			classes: classSources(parsed.body, bundles).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120)
		});
	}
	return offenders;
}

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) svelteFiles(full, out);
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

const files = svelteFiles(libDir);

describe('bordered content containers', () => {
	it('finds elements to check at all (guards the extractor itself)', () => {
		// A silent regression in the tag walker or the class extractor would make
		// the assertion below vacuously green, which is the failure mode this
		// whole gate exists to prevent in the first place.
		expect(files.length).toBeGreaterThan(50);

		const painted = scanFile(
			readFileSync(join(libDir, 'components/ui/panel/panel.svelte'), 'utf8'),
			'panel'
		);
		expect(painted, 'Panel draws a full border AND paints bg-card — must not flag').toEqual([]);

		// Positive control: the exact shape of the defect must be caught.
		expect(scanFile('<div class="rounded-md border">x</div>', 'probe')).toHaveLength(1);
		// …and each excuse must actually excuse.
		expect(scanFile('<button class="rounded-md border">x</button>', 'probe')).toEqual([]);
		expect(scanFile('<div class="rounded-md border bg-card">x</div>', 'probe')).toEqual([]);
		expect(scanFile('<div class="border-2 border-transparent">x</div>', 'probe')).toEqual([]);
		expect(scanFile('<div class="border rounded-md last:border-0">x</div>', 'probe')).toEqual([]);
		expect(scanFile('<div class="border-b px-4">x</div>', 'probe')).toEqual([]);
		// A `>` inside an expression must not truncate the tag being read.
		expect(scanFile('<div onclick={() => go()} class="border rounded">x</div>', 'probe')).toHaveLength(
			1
		);
	});

	it('every one declares a surface', () => {
		const offenders = files.flatMap((f) => scanFile(readFileSync(f, 'utf8'), relative(packageRoot, f)));
		expect(
			offenders.map((o) => `${o.file}:${o.line} <${o.tag}> — ${o.classes}`),
			'bordered content containers that paint nothing (add the bg-card border-border ds-edge surface)'
		).toEqual([]);
	});
});

/**
 * LIMITS — what a green run here does NOT prove.
 *
 *  1. It is static. It reads authored utility classes; it never measures a
 *     computed style. The claim "this container is opaque in a real engine, in
 *     both themes" belongs to harness/drive.mjs, and was made by hand for this
 *     fix (light `oklch(1 0 0)`, dark `oklch(0.215 0.02 260)`).
 *  2. Runtime class strings are invisible. A surface a consuming app passes in
 *     through `class`/`klass`, or one built by string concatenation, is not
 *     read — this package cannot see what an app hands it.
 *  3. Variant bundles are flattened, not evaluated (see variantBundles). A
 *     colour variant group where only some arms supply a background passes.
 *  4. Hand-written CSS is out of scope. A surface painted by a rule in
 *     styles.css rather than by a utility reads here as no background at all;
 *     no component in the package does that today.
 *  5. It cannot see the page. A bordered container deliberately transparent
 *     because a painted ancestor already carries the surface would be a false
 *     positive; there are none today, and the fix for one is to argue it, not
 *     to widen the excuses.
 *  6. Controls are excluded wholesale by tag, so a genuinely broken control
 *     surface is out of reach. That is the trade that keeps the gate quiet
 *     enough to survive: every control in this package takes its background
 *     from a variant or a state, and a rule that flagged them would have fired
 *     on eight elements the day it landed and been switched off by the second.
 */
