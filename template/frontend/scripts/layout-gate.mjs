// `pnpm layout-gate [routes...] | --all`. Gates the routes a change touches, not
// the whole app: a run is minutes per route, and a change touches few.
//   pnpm layout-gate /library /settings   gate exactly these routes
//   pnpm layout-gate                      gate the routes whose +page files differ from origin/main
//   pnpm layout-gate --all                the whole-app sweep, for CI or a release
//   --list                                print the routes that would be gated and stop
// A shared file (src/lib, a +layout, app.css) reaches routes no diff can name, so
// with only those changed the run stops and asks for the routes by name.
// A judged run writes each route's verdict into RECORD, against the route's key (routeKey: the
// files it renders) and the prompt that judged it; commit it with the change, since the change pipeline reads it
// (check-layout-gate.mjs).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PAGE = /^src\/routes\/(.*?)\+page\.(?:svelte|ts|js)$/;
export const RECORD = '.layout-gate-record.json';
const REPORT = 'test-results/layout-gate/report.json';

/** A file that draws the picture: src/ less its tests and type declarations. */
export const drawn = (file) =>
	file.startsWith('src/') && !/\.(?:test|spec)\.[jt]s$|\.d\.ts$|^src\/test\//.test(file);

/** Route paths named by changed files, plus the changed files that name none. */
export function routesFromChanges(files) {
	const routes = new Set();
	const shared = [];
	const unresolved = [];
	for (const file of files) {
		if (!drawn(file)) continue;
		const m = PAGE.exec(file);
		if (!m) {
			shared.push(file);
			continue;
		}
		const segments = m[1].split('/').filter((s) => s && !/^\(.*\)$/.test(s));
		const path = '/' + segments.join('/');
		// A [param] route has no URL until someone names a record.
		if (segments.some((s) => /[[\]]/.test(s))) unresolved.push(file);
		else routes.add(path);
	}
	return { routes: [...routes].sort(), shared, unresolved };
}

function git(...args) {
	const r = spawnSync('git', args, { encoding: 'utf8' });
	return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : null;
}

function gitz(...args) {
	const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
	if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr.trim()}`);
	return r.stdout.split('\0').filter(Boolean);
}

/** The build's inputs outside src/ that draw every route: static assets, the bundler's and compiler's config, path aliases. */
export const GLOBAL =
	/^(?:static\/.*|[\w.-]*(?:vite|svelte|tailwind|postcss)[\w.-]*\.config\.[cm]?[jt]s|tsconfig[\w.-]*\.json)$/;
const keeps = (path) => drawn(path) || GLOBAL.test(path);

/** path → blob id of every drawn file and global build input: in the working tree, or at commit `ref`. */
export function drawnFiles(ref) {
	const out = new Map();
	if (ref) {
		for (const entry of gitz('ls-tree', '-r', '-z', ref)) {
			const [meta, path] = entry.split('\t');
			const [, type, blob] = meta.split(' ');
			if (type === 'blob' && keeps(path)) out.set(path, blob);
		}
		out.read = (path) => {
			const r = spawnSync('git', ['cat-file', 'blob', out.get(path)], {
				encoding: 'utf8',
				maxBuffer: 1 << 28
			});
			return r.status === 0 ? r.stdout : '';
		};
		return out;
	}
	const paths = [
		...new Set(gitz('ls-files', '-z', '--cached', '--others', '--exclude-standard'))
	].filter((p) => keeps(p) && existsSync(p));
	// Absolute: git reads --stdin-paths from the top of the work tree, not from here.
	const r = spawnSync('git', ['hash-object', '--stdin-paths'], {
		input: paths.map((p) => resolve(p)).join('\n'),
		encoding: 'utf8',
		maxBuffer: 1 << 28
	});
	if (r.status !== 0) throw new Error(`git hash-object: ${r.stderr.trim()}`);
	const blobs = r.stdout.split('\n');
	paths.forEach((p, i) => out.set(p, blobs[i]));
	out.read = (path) => readFileSync(path, 'utf8');
	return out;
}

/** One key for a drawn tree, whichever way it was read. */
export function treeKey(files) {
	const lines = [...files]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([path, blob]) => `${blob} ${path}\n`);
	return createHash('sha256').update(lines.join('')).digest('hex');
}

const SOURCE = /\.(?:svelte|[cm]?[jt]s|css)$/;
const EXT = ['', '.ts', '.js', '.svelte', '.svelte.ts', '.svelte.js', '.css', '.json', '.mjs'];
const SPECIFIER = [
	/\b(?:from|import|require)\s*\(?\s*(['"])([^'"\n]+)\1/g,
	/@(?:import|reference|plugin|config)\s+(?:url\(\s*)?(['"])([^'"\n]+)\1/g,
	/\burl\(\s*(['"]?)([^'")\s]+)\1\s*\)/g,
	/\bnew URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url/g
];
// An import no static read can follow: the route's closure cannot be known, so it is the whole tree.
const OPAQUE = /\bimport\s*\(\s*[^'"\s)]|\brequire\s*\(\s*[^'"\s)]/;
// import.meta.glob with literal patterns names the files it pulls in; any other argument is opaque.
const GLOB = /import\.meta\.glob\s*(?:<[\s\S]*?>)?\s*\(/g;
const GLOB_LITERAL =
	/import\.meta\.glob\s*(?:<[\s\S]*?>)?\s*\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`$]*`)/g;
const globRegex = (pattern) => {
	let out = '';
	let depth = 0;
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === '*' && pattern[i + 1] === '*') {
			out += '(?:.*/)?';
			i += pattern[i + 2] === '/' ? 2 : 1;
		} else if (c === '*') out += '[^/]*';
		else if (c === '?') out += '[^/]';
		else if (c === '{') {
			out += '(?:';
			depth++;
		}
		else if (c === '}' && depth) {
			out += ')';
			depth--;
		}
		else if (c === ',' && depth) out += '|';
		else out += c.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
	}
	return new RegExp(`^${out}$`);
};

// SvelteKit's route segments: [[optional]], [...rest], [param] or [param=matcher] anywhere in a
// segment, and [x+3a] / [u+003a] for a literal character. A matcher cannot be run, so a
// param matches any text: more pages than SvelteKit would pick, never fewer.
const TOKEN = /\[\[[^\]]+\]\]|\[\.\.\.[^\]]+\]|\[(?:x\+[0-9a-f]{2}|u\+[0-9a-f]{4,6})\]|\[[^\]]+\]/g;
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function segment(dir) {
	if (/^\[\[[^\]]+\]\]$/.test(dir)) return { optional: true, re: /^.*$/ };
	if (/^\[\.\.\.[^\]]+\]$/.test(dir)) return { rest: true };
	let re = '';
	let last = 0;
	for (const m of dir.matchAll(TOKEN)) {
		re += escapeRe(dir.slice(last, m.index));
		const hex = /^\[(?:x\+([0-9a-f]{2})|u\+([0-9a-f]{4,6}))\]$/.exec(m[0]);
		re += hex ? escapeRe(String.fromCodePoint(parseInt(hex[1] ?? hex[2], 16))) : '.+';
		last = m.index + m[0].length;
	}
	return { re: new RegExp(`^${re}${escapeRe(dir.slice(last))}$`) };
}
const matches = (pattern, segs) => {
	if (!pattern.length) return !segs.length;
	const [p, ...rest] = pattern;
	if (p.rest) return true;
	if (p.optional) return matches(rest, segs) || (segs.length > 0 && matches(rest, segs.slice(1)));
	return segs.length > 0 && p.re.test(segs[0]) && matches(rest, segs.slice(1));
};

/** The drawn file a specifier names from `from`, null when it is a package or a file nothing draws; undefined when it cannot be followed. */
function target(files, spec, from) {
	const bare = spec.replace(/(?:\?|(?<=.)#).*$/, '');
	let base;
	if (bare.startsWith('.')) base = join(dirname(from), bare);
	else if (bare === '$lib' || bare.startsWith('$lib/')) base = `src/lib${bare.slice(4)}`;
	else if (bare.startsWith('#lib/')) base = `src/lib${bare.slice(4)}`;
	else if (/^[$#]/.test(bare) && !/^\$(?:app|env|service-worker)(?:\/|$)/.test(bare))
		return undefined;
	else return null;
	const stem = base.replace(/\.js$/, '');
	for (const b of [base, stem])
		for (const x of [...EXT, ...EXT.map((e) => `/index${e}`)]) if (files.has(b + x)) return b + x;
	return null;
}

/**
 * The drawn files a route renders: the closure of its page, its layouts, the app shell files
 * and every import (a route's URL is matched to its page directories, all that match are
 * taken; a URL that matches no page renders only the shell). Anything the read cannot follow
 * (an unresolved alias, a computed import, a glob) is the whole drawn tree.
 */
export function renders(files, route) {
	const read = files.read ?? (() => '');
	const segs = route.split('/').filter(Boolean);
	const pageDirs = new Set();
	for (const p of files.keys()) {
		const m = /^(src\/routes(?:\/.*)?)\/\+page[.@]/.exec(p);
		if (!m) continue;
		const own = m[1]
			.slice('src/routes'.length)
			.split('/')
			.filter((s) => s && !/^\(.*\)$/.test(s))
			.map(segment);
		if (matches(own, segs)) pageDirs.add(m[1]);
	}
	const seen = new Set();
	const queue = [];
	const add = (p) => {
		if (!seen.has(p)) {
			seen.add(p);
			queue.push(p);
		}
	};
	for (const p of files.keys()) {
		const dir = dirname(p);
		const name = p.slice(dir.length + 1);
		// Everything every route draws, or can reach: the build's global inputs, the shell, the
		// param matchers that pick a page, and every endpoint a load or a component can fetch.
		if (GLOBAL.test(p) || /^src\/(?:app\.|hooks[.\/]|params\/)/.test(p)) add(p);
		else if (/^src\/routes\/(?:.*\/)?\+server\./.test(p)) add(p);
		else if (p.startsWith('src/routes/')) {
			if (/^\+page[.@]/.test(name) && pageDirs.has(dir)) add(p);
			else if (
				/^\+(?:layout|error)[.@]/.test(name) &&
				[...pageDirs].some((d) => d === dir || d.startsWith(`${dir}/`))
			)
				add(p);
		}
	}
	while (queue.length) {
		const from = queue.pop();
		if (!SOURCE.test(from)) continue;
		const text = read(from);
		if (OPAQUE.test(text)) return new Set(files.keys());
		const globs = [...text.matchAll(GLOB_LITERAL)];
		if (globs.length !== [...text.matchAll(GLOB)].length) return new Set(files.keys());
		for (const g of globs)
			for (const [, , pattern] of g[1].matchAll(/(['"`])(.*?)\1/g)) {
				if (pattern.startsWith('!')) continue;
				const root = pattern.startsWith('/') ? pattern.slice(1) : pattern;
				const at = /^[$#]lib\//.test(root)
					? `src/lib${root.slice(4)}`
					: root.startsWith('.')
						? join(dirname(from), root)
						: pattern.startsWith('/')
							? root
							: null;
				if (at === null) return new Set(files.keys());
				const re = globRegex(at);
				for (const p of files.keys()) if (re.test(p)) add(p);
			}
		for (const re of SPECIFIER)
			for (const m of text.matchAll(re)) {
				let spec = m[2];
				if (re === SPECIFIER[2]) {
					if (/^(?:[a-z][a-z0-9+.-]*:|[/#])/i.test(spec)) continue;
					if (!/^(?:\.|\$lib|#lib)/.test(spec)) spec = `./${spec}`;
				}
				const to = target(files, spec, from);
				if (to === undefined) return new Set(files.keys());
				if (to) add(to);
			}
	}
	return seen;
}

/** The key a route is judged against: its rendered files and their blobs. A change outside them leaves it, and the judgement, valid. */
export const routeKey = (files, route) =>
	treeKey(new Map([...renders(files, route)].map((p) => [p, files.get(p)])));

function writeRecord(files) {
	if (!existsSync(REPORT)) return;
	const report = JSON.parse(readFileSync(REPORT, 'utf8'));
	if (!report.judging || !report.done) return;
	const unanswered = report.routes.filter((r) => r.samples.some((s) => s.verdict === 'error'));
	if (unanswered.length) {
		console.error(
			`layout-gate: the judge did not answer every sample for ${unanswered.map((r) => r.path).join(', ')}, so nothing is recorded; run it again.`
		);
		return;
	}
	const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { routes: {} };
	const judged = new Date().toISOString();
	for (const r of report.routes) {
		record.routes[r.path] = {
			tree: routeKey(files, r.path),
			judged,
			prompt: r.prompt,
			judge: [...new Set(r.samples.map((s) => s.judge))].join(' and ') || undefined,
			verdict: r.verdict === 'pass' ? 'ship' : 'fix',
			...(r.failures.length
				? { failures: r.failures }
				: { samples: r.samples.map((s) => `${s.verdict} ${s.call}`.trim()) })
		};
	}
	record.routes = Object.fromEntries(
		Object.entries(record.routes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	);
	writeFileSync(RECORD, `${JSON.stringify(record, null, '\t')}\n`);
	console.log(`layout-gate: recorded; commit ${RECORD} with the change.`);
}

function changedFiles() {
	const base = git('merge-base', 'origin/main', 'HEAD')?.[0] ?? 'HEAD';
	const tracked = git('diff', '--name-only', '--relative', base) ?? [];
	const fresh = git('ls-files', '--others', '--exclude-standard') ?? [];
	return [...new Set([...tracked, ...fresh])];
}

function main(argv) {
	const all = argv.includes('--all');
	const list = argv.includes('--list');
	const named = argv.filter((a) => a.startsWith('/'));
	const rest = argv.filter((a) => !a.startsWith('/') && a !== '--all' && a !== '--list');
	if (rest.length) {
		console.error(
			`layout-gate: unknown argument ${rest.join(' ')}. Routes start with /, or --all.`
		);
		return 2;
	}
	let routes = named;
	if (!all && !named.length) {
		const found = routesFromChanges(changedFiles());
		for (const f of found.unresolved) {
			console.error(
				`layout-gate: ${f} is a [param] route; name a concrete URL: pnpm layout-gate /x/1`
			);
		}
		if (!found.routes.length) {
			if (found.shared.length || found.unresolved.length) {
				console.error(
					`layout-gate: only shared files changed (${found.shared.slice(0, 3).join(', ')}${found.shared.length > 3 ? ', …' : ''}); they reach routes the diff cannot name.\n` +
						'Name the routes that show the change, once, at the end: pnpm layout-gate /a /b\n' +
						'(--all is the whole-app sweep, for CI or a release).'
				);
				return 2;
			}
			console.log('layout-gate: no route changed, nothing to gate.');
			return 0;
		}
		routes = found.routes;
	}
	console.log(all ? 'layout-gate: whole-app sweep' : `layout-gate: ${routes.join(', ')}`);
	if (list) return 0;
	const env = { ...process.env };
	if (all) delete env.LAYOUT_GATE_ROUTES;
	else env.LAYOUT_GATE_ROUTES = routes.join(',');
	const files = drawnFiles();
	rmSync(REPORT, { force: true });
	const r = spawnSync('playwright', ['test', '--config', 'playwright.layout.config.ts'], {
		stdio: 'inherit',
		env
	});
	writeRecord(files);
	return r.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
