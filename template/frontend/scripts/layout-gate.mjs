// `pnpm layout-gate [routes...] | --all`. Gates the routes a change touches, not
// the whole app: a run is minutes per route, and a change touches few.
//   pnpm layout-gate /library /settings   gate exactly these routes
//   pnpm layout-gate                      gate the routes whose +page files differ from origin/main
//   pnpm layout-gate --all                the whole-app sweep, for CI or a release
//   --list                                print the routes that would be gated and stop
// A shared file (src/lib, a +layout, app.css) reaches routes no diff can name, so
// with only those changed the run stops and asks for the routes by name.
import { spawnSync } from 'node:child_process';

const PAGE = /^src\/routes\/(.*?)\+page\.(?:svelte|ts|js)$/;

/** Route paths named by changed files, plus the changed files that name none. */
export function routesFromChanges(files) {
	const routes = new Set();
	const shared = [];
	const unresolved = [];
	for (const file of files) {
		if (!file.startsWith('src/') || /\.(?:test|spec)\.[jt]s$/.test(file)) continue;
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
	const r = spawnSync('playwright', ['test', '--config', 'playwright.layout.config.ts'], {
		stdio: 'inherit',
		env
	});
	return r.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
