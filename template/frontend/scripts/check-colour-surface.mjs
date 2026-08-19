#!/usr/bin/env node
/**
 * The shadcn colour surface must actually resolve. Nothing else notices if it does not.
 *
 * `src/app.css` carries two load-bearing lines:
 *
 *   @import '@poodle64/ui/styles.css'   the shadcn semantic surface AND its
 *                                       Tailwind v4 `@theme inline` registration
 *   @source '.../@poodle64/ui/dist'     puts the package inside Tailwind's scan
 *
 * Delete either and every gate this app has still passes: `pnpm build`, `lint`,
 * `lint:css` and `check` all succeed, and the app ships with `bg-card`,
 * `bg-muted`, `bg-accent`, `bg-popover` and `border-input` compiling to no rule
 * at all — no build error, no lint hit, no failing test, just classes in the DOM
 * with nothing behind them. That is poodle64/design-system#3, which reached every
 * app in the estate before anyone saw it: dropdowns with no hover, inputs with no
 * border, cards and popovers with no surface.
 *
 * The two lines fail differently, so this asserts them differently:
 *
 *   registration  compile a fixed set of semantic utilities and require each to
 *                 emit a real declaration. Losing the @import kills all of them.
 *   scanning      ask the compiler which sources it resolved, read the package's
 *                 own dist through them, and require that its classes both appear
 *                 and compile. Losing the @source leaves registration intact — the
 *                 utilities still compile when named explicitly — and silently
 *                 stops generating everything the shared components themselves use.
 *
 * Exit 1 on any failure; run by `pnpm lint:colour` and by CI.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { compile } from 'tailwindcss';

/** Semantic names the package registers; each must emit a real declaration. */
const REGISTERED = ['bg-card', 'bg-muted', 'bg-accent', 'bg-popover', 'border-input'];
const PACKAGE = '@poodle64/ui';
const ENTRY = resolve('src/app.css');

/**
 * Resolve a stylesheet the way the bundler does.
 *
 * `require.resolve` cannot be used: a CSS-only package exports neither a JS main
 * nor `./package.json`. Walk `node_modules` on disk instead, from the REAL path —
 * pnpm links each dependency into a store directory and a package's own siblings
 * live beside it there, not under this app's symlink.
 */
function resolveStylesheet(id, base) {
	if (id.startsWith('.') || id.startsWith('/')) return resolve(base, id);
	const scoped = id.startsWith('@');
	const pkgName = id
		.split('/')
		.slice(0, scoped ? 2 : 1)
		.join('/');
	const sub = id
		.split('/')
		.slice(scoped ? 2 : 1)
		.join('/');
	for (let dir = realpathSync(base); ; dir = dirname(dir)) {
		const root = resolve(dir, 'node_modules', pkgName);
		if (existsSync(root)) {
			const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
			const pick = (e) =>
				typeof e === 'string' ? e : (e?.style ?? e?.default ?? e?.import ?? e?.require);
			const key = sub ? `./${sub}` : '.';
			let entry = pick(pkg.exports?.[key]) ?? pick(pkg.exports?.[`${key}.css`]);
			if (!entry && sub) {
				const direct = resolve(root, sub.endsWith('.css') ? sub : `${sub}.css`);
				if (existsSync(direct)) return direct;
			}
			entry ??= pkg.style ?? pick(pkg.exports?.['.']) ?? pkg.main;
			if (!entry) throw new Error(`no stylesheet entry for ${id}`);
			return resolve(root, entry);
		}
		if (dirname(dir) === dir) throw new Error(`cannot resolve stylesheet ${id} from ${base}`);
	}
}

async function buildCompiler() {
	return compile(await readFile(ENTRY, 'utf8'), {
		base: dirname(ENTRY),
		loadStylesheet: async (id, base) => {
			const path = resolveStylesheet(id, base);
			return { path, base: dirname(path), content: await readFile(path, 'utf8') };
		},
		loadModule: async (id, base) => {
			const { createRequire } = await import('node:module');
			const req = createRequire(resolve(base, '_'));
			const path = id.startsWith('.') ? resolve(base, id) : req.resolve(id);
			return { path, base: dirname(path), module: (await import(path)).default };
		}
	});
}

async function filesUnder(dir, acc = []) {
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) await filesUnder(p, acc);
		else if (/\.(svelte|js|ts)$/.test(e.name)) acc.push(p);
	}
	return acc;
}

/** Class-ish tokens, deliberately loose: a superset is fine, we only need some to compile. */
function candidatesIn(text) {
	return new Set(
		(text.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g) ?? []).filter(
			(c) => c.length < 40 && !c.includes('--')
		)
	);
}

const failures = [];
const compiler = await buildCompiler();

// 1. Registration — the @import.
const registeredCss = compiler.build(REGISTERED);
for (const utility of REGISTERED) {
	const rule = registeredCss.match(new RegExp(`\\.${utility}\\s*\\{([^}]*)\\}`));
	if (!rule) {
		failures.push(`${utility}: no rule at all — the shadcn surface is not registered`);
	} else if (!/var\(--/.test(rule[1])) {
		failures.push(`${utility}: emits ${rule[1].trim()} — not resolving to a token`);
	}
}

// 2. Scanning — the @source.
// Each entry is { base, pattern, negated }; the pattern is the @source argument,
// relative to the file that declared it. Removing the @source line empties this
// list entirely, which is the signal.
const scanned = (compiler.sources ?? [])
	.filter((s) => !s.negated)
	.map((s) => (typeof s === 'string' ? s : resolve(s.base, s.pattern)));
const packageSource = scanned.find((s) => s.includes(PACKAGE));
if (!packageSource) {
	failures.push(
		`no @source covers ${PACKAGE}: Tailwind never scans the shared components, so every ` +
			`utility they use and this app does not compiles to nothing`
	);
} else if (!existsSync(packageSource) || !statSync(packageSource).isDirectory()) {
	failures.push(`the @source for ${PACKAGE} points at ${packageSource}, which is not a directory`);
} else {
	const candidates = new Set();
	for (const file of await filesUnder(packageSource)) {
		for (const c of candidatesIn(await readFile(file, 'utf8'))) candidates.add(c);
	}
	const produced = compiler.build([...candidates]);
	const emitted = [...candidates].filter((c) => produced.includes(`.${c}`));
	if (emitted.length === 0) {
		failures.push(
			`${PACKAGE}'s own sources produced no utilities: the package is in the scan but ` +
				`nothing it uses compiles`
		);
	}
}

if (failures.length > 0) {
	console.error('\nThe shadcn colour surface does not resolve:\n');
	for (const f of failures) console.error(`  - ${f}`);
	console.error(
		`\nsrc/app.css must keep BOTH \`@import '${PACKAGE}/styles.css'\` and ` +
			`\`@source '../node_modules/${PACKAGE}/dist'\`, and must not re-declare the shadcn\n` +
			`names (--card, --muted, --accent, --popover, --input) as plain custom properties:\n` +
			`that makes the variable exist without registering it as a theme colour.\n`
	);
	process.exit(1);
}

console.log(
	`colour surface: ${REGISTERED.length} semantic utilities resolve, ${PACKAGE} is scanned`
);
