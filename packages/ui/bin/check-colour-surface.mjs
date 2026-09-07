#!/usr/bin/env node
/**
 * The shadcn colour surface must actually resolve. Nothing else notices if it does not.
 *
 * The consuming app's `src/app.css` carries two load-bearing lines:
 *
 *   @import '@poodle64/ui/styles.css'   the shadcn semantic surface AND its
 *                                       Tailwind v4 `@theme inline` registration
 *   @source '.../@poodle64/ui/dist'     puts the package inside Tailwind's scan
 *
 * Delete either and every gate an app has still passes: `pnpm build`, `lint`,
 * `lint:css` and `check` all succeed, and the app ships with `bg-card`,
 * `bg-muted`, `bg-accent`, `bg-popover` and `border-input` compiling to no rule
 * at all — no build error, no lint hit, no failing test, just classes in the DOM
 * with nothing behind them. That is radar-hooves/design-system#3, which reached every
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
 * It ships from the package because nine apps carried a byte-identical copy of it
 * under `frontend/scripts/`, and three carried none: a gate that guards THIS
 * package's surface, maintained in nine places, is the divergence it exists to
 * stop. The only substantive change from that vendored form is where it looks —
 * the app root comes from the working directory or `--entry`, not from the
 * script's own location, because the script no longer lives in the app.
 *
 * Usage: ds-check-colour-surface [--entry <path to app.css>]   (default: src/app.css)
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

/** Semantic names the package registers; each must emit a real declaration. */
const REGISTERED = ['bg-card', 'bg-muted', 'bg-accent', 'bg-popover', 'border-input'];
const PACKAGE = '@poodle64/ui';

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

/**
 * Tailwind comes from the APP, never from this package's own tree.
 *
 * Under pnpm a bin runs from inside the store, where only what @poodle64/ui
 * itself declares is reachable; the compiler that matters is the one the app
 * builds with, and compiling against a different copy would prove nothing about
 * the app's own output.
 *
 * Resolution starts at the STYLESHEET, not the working directory, so
 * `--entry frontend/src/app.css` works from a repo root — which is where a
 * pre-commit hook runs, and where the nine vendored copies this replaces were
 * invoked from.
 */
async function loadCompiler(from) {
	const require = createRequire(resolve(from, '_'));
	let manifestPath;
	try {
		manifestPath = require.resolve('tailwindcss/package.json');
	} catch {
		throw new Error(
			`tailwindcss is not resolvable from ${from} — this gate compiles the app's own ` +
				'stylesheet, so it needs the compiler the app builds with'
		);
	}

	// Resolve the ESM condition explicitly. `require.resolve('tailwindcss')`
	// picks the `require` condition — Tailwind's CJS bundle — from which
	// `compile` is not an ESM named export, so the import succeeds and hands
	// back undefined. That reads as "compile is not a function" several frames
	// later, which is a long way from the actual cause.
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const map = manifest.exports?.['.'] ?? {};
	const relative_ = typeof map === 'string' ? map : (map.import ?? map.default ?? map.require);
	if (!relative_) throw new Error('tailwindcss declares no importable entry point');
	const entry = resolve(dirname(manifestPath), relative_);

	const module = await import(pathToFileURL(entry).href);
	const compile = module.compile ?? module.default?.compile;
	if (typeof compile !== 'function') {
		throw new Error(`tailwindcss at ${entry} exports no compile(): is it v4?`);
	}
	return compile;
}

async function buildCompiler(compile, entryPath) {
	return compile(await readFile(entryPath, 'utf8'), {
		base: dirname(entryPath),
		loadStylesheet: async (id, base) => {
			const path = resolveStylesheet(id, base);
			return { path, base: dirname(path), content: await readFile(path, 'utf8') };
		},
		loadModule: async (id, base) => {
			const req = createRequire(resolve(base, '_'));
			const path = id.startsWith('.') ? resolve(base, id) : req.resolve(id);
			return { path, base: dirname(path), module: (await import(pathToFileURL(path).href)).default };
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

export async function checkColourSurface({ cwd = process.cwd(), entry } = {}) {
	const entryPath = resolve(cwd, entry ?? join('src', 'app.css'));
	if (!existsSync(entryPath)) {
		throw new Error(
			`no stylesheet at ${relative(cwd, entryPath) || entryPath} — run this from the app ` +
				'directory, or pass --entry'
		);
	}

	const failures = [];
	const compiler = await buildCompiler(await loadCompiler(dirname(entryPath)), entryPath);

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

	return { entryPath, failures };
}

async function main(argv) {
	const at = argv.indexOf('--entry');
	const entry = at === -1 ? undefined : argv[at + 1];
	if (at !== -1 && !entry) {
		console.error('ds-check-colour-surface: --entry needs a path');
		return 1;
	}

	let result;
	try {
		result = await checkColourSurface({ entry });
	} catch (error) {
		// A gate that could not run has not passed. Say which, and where it looked.
		console.error(`ds-check-colour-surface: ${error.message}`);
		console.error(`  cwd: ${process.cwd()}`);
		return 1;
	}

	if (result.failures.length > 0) {
		console.error('\nThe shadcn colour surface does not resolve:\n');
		for (const f of result.failures) console.error(`  - ${f}`);
		console.error(
			`\n${relative(process.cwd(), result.entryPath)} must keep BOTH ` +
				`\`@import '${PACKAGE}/styles.css'\` and \`@source '../node_modules/${PACKAGE}/dist'\`,\n` +
				`and must not re-declare the shadcn names (--card, --muted, --accent, --popover,\n` +
				`--input) as plain custom properties: that makes the variable exist without\n` +
				`registering it as a theme colour.\n`
		);
		return 1;
	}

	console.log(
		`colour surface: ${REGISTERED.length} semantic utilities resolve, ${PACKAGE} is scanned`
	);
	return 0;
}

// Importable for the test suite; only a direct CLI invocation exits.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exit(await main(process.argv.slice(2)));
}
