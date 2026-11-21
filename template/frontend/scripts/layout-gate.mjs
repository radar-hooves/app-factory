// `pnpm layout-gate [routes...] | --all`. Gates the routes a change touches, not
// the whole app: a run is minutes per route, and a change touches few.
//   pnpm layout-gate /library /settings   gate exactly these routes
//   pnpm layout-gate                      gate the routes whose +page files differ from origin/main
//   pnpm layout-gate --all                the whole-app sweep, for CI or a release
//   --list                                print the routes that would be gated and stop
// A shared file (src/lib, a +layout, app.css) reaches routes no diff can name, so
// with only those changed the run stops and asks for the routes by name.
// A judged run writes each route's verdict into RECORD, against the drawn tree it judged and
// the prompt that judged it; commit it with the change, since the change pipeline reads it
// (check-layout-gate.mjs).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/** path → blob id of every drawn file: in the working tree, or at commit `ref`. */
export function drawnFiles(ref) {
	const out = new Map();
	if (ref) {
		for (const entry of gitz('ls-tree', '-r', '-z', ref, '--', 'src')) {
			const [meta, path] = entry.split('\t');
			const [, type, blob] = meta.split(' ');
			if (type === 'blob' && drawn(path)) out.set(path, blob);
		}
		return out;
	}
	const paths = [
		...new Set(gitz('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src'))
	].filter((p) => drawn(p) && existsSync(p));
	// Absolute: git reads --stdin-paths from the top of the work tree, not from here.
	const r = spawnSync('git', ['hash-object', '--stdin-paths'], {
		input: paths.map((p) => resolve(p)).join('\n'),
		encoding: 'utf8',
		maxBuffer: 1 << 28
	});
	if (r.status !== 0) throw new Error(`git hash-object: ${r.stderr.trim()}`);
	const blobs = r.stdout.split('\n');
	paths.forEach((p, i) => out.set(p, blobs[i]));
	return out;
}

/** One key for a drawn tree, whichever way it was read. */
export function treeKey(files) {
	const lines = [...files]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([path, blob]) => `${blob} ${path}\n`);
	return createHash('sha256').update(lines.join('')).digest('hex');
}

function writeRecord(tree) {
	if (!existsSync(REPORT)) return;
	const report = JSON.parse(readFileSync(REPORT, 'utf8'));
	if (!report.judging || !report.done) return;
	const unanswered = report.routes.filter((r) => r.samples.some((s) => s.verdict === 'error'));
	if (unanswered.length) {
		console.error(
			`layout-gate: ${report.model} did not answer every sample for ${unanswered.map((r) => r.path).join(', ')}, so nothing is recorded; run it again.`
		);
		return;
	}
	const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { routes: {} };
	const judged = new Date().toISOString();
	for (const r of report.routes) {
		record.routes[r.path] = {
			tree,
			judged,
			prompt: r.prompt,
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
	const tree = treeKey(drawnFiles());
	rmSync(REPORT, { force: true });
	const r = spawnSync('playwright', ['test', '--config', 'playwright.layout.config.ts'], {
		stdio: 'inherit',
		env
	});
	writeRecord(tree);
	return r.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
