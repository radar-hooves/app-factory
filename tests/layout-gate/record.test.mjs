// The judgement record: what the change pipeline refuses, driven against a real git repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { refusal } from '../../template/frontend/scripts/check-layout-gate.mjs';

const SCRIPTS = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../template/frontend/scripts'
);
const RECORD = '.layout-gate-record.json';
let repo, fe, base;

// No runner's key or store is ever the real one: a test names its own, or none.
const NO_KEY = { LAYOUT_GATE_KEY_FILE: '/nonexistent/layout-gate', LAYOUT_GATE_STORE: '/nonexistent/store' };
const sh = (cmd, args, env = {}) =>
	spawnSync(cmd, args, { cwd: fe, encoding: 'utf8', env: { ...process.env, ...NO_KEY, ...env } });
const git = (...args) => {
	const r = sh('git', args);
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
};
const put = (file, text) => {
	mkdirSync(path.dirname(path.join(fe, file)), { recursive: true });
	writeFileSync(path.join(fe, file), text);
};
const commit = (message) => {
	git('add', '.', '../.copier-answers.yml');
	git('commit', '-qm', message);
	return git('rev-parse', 'HEAD');
};
const check = (env = { CHANGE_BASE: base, CI: 'true' }) =>
	sh('node', ['scripts/check-layout-gate.mjs'], env);
// What the gate records for these route verdicts on the tree as it stands, judged on
// `prompt` (null: a record from before it carried one), kept beside the routes it already
// holds, as a judged run does.
const judge = (verdicts, prompt = 'p1') =>
	sh('node', [
		'--input-type=module',
		'-e',
		`import { existsSync, readFileSync, writeFileSync } from 'node:fs';
		 import { RECORD, drawnFiles, routeKey } from './scripts/layout-gate.mjs';
		 const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { routes: {} };
		 const files = drawnFiles();
		 const prompt = ${JSON.stringify(prompt)};
		 for (const [route, verdict] of Object.entries(${JSON.stringify(verdicts)}))
		   record.routes[route] = { tree: routeKey(files, route), ...(prompt ? { prompt } : {}), verdict, samples: [verdict + ' c1', verdict + ' c2', verdict + ' c3'] };
		 writeFileSync(RECORD, JSON.stringify(record));`
	]);
const answers = (tag) => writeFileSync(path.join(repo, '.copier-answers.yml'), `_commit: ${tag}\n`);

before(() => {
	repo = mkdtempSync(path.join(tmpdir(), 'layout-record-'));
	fe = path.join(repo, 'frontend');
	mkdirSync(fe);
	cpSync(SCRIPTS, path.join(fe, 'scripts'), { recursive: true });
	assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
	git('config', 'user.email', 'selftest@invalid');
	git('config', 'user.name', 'selftest');
	answers('v1');
	put('src/routes/a/+page.svelte', '<p>a</p>\n');
	put('src/routes/b/+page.svelte', '<p>b</p>\n');
	put('src/routes/+page.svelte', "<script>import { x } from '$lib/x';</script>\n<p>{x}</p>\n");
	put('src/routes/(protected)/settings/+page.svelte', "<script>import { x } from '$lib/x';</script>\n<p>{x}</p>\n");
	put('src/lib/x.ts', 'export const x = 1;\n');
	put('src/lib/x.test.ts', 'test\n');
	base = commit('base');
});

after(() => rmSync(repo, { recursive: true, force: true }));

test('nothing redrawn: not asked; a test or type file draws nothing', () => {
	assert.equal(check().status, 0);
	put('src/lib/x.test.ts', 'test changed\n');
	put('src/lib/api/schema.d.ts', 'export {};\n');
	assert.equal(check().status, 0);
});

test('a redrawn page with no record is refused, naming the route', () => {
	put('src/routes/a/+page.svelte', '<p>a, redrawn</p>\n');
	const r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /pnpm layout-gate \/a/);
});

test("an app's own redraw judged fix is refused: every route it shows on ships", () => {
	assert.equal(judge({ '/a': 'fix' }).status, 0);
	const r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/a judges fix on this tree/);
});

test('a record of this tree shipping the route lets it land, committed or not', () => {
	assert.equal(judge({ '/a': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	commit('redraw a, judged');
	assert.equal(check().status, 0);
});

test('a record that does not judge the changed route on this tree is refused', () => {
	put('src/routes/a/+page.svelte', '<p>a, redrawn again</p>\n');
	assert.equal(judge({ '/b': 'ship' }).status, 0);
	const r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/a changed and/);
});

test('a file no judged route renders, changed after the judgement: refused', () => {
	assert.equal(judge({ '/a': 'ship' }).status, 0);
	put('src/lib/x.ts', 'export const x = 2;\n');
	const r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /src\/lib\/x\.ts changed and no judged route renders it/);
});

test("another lane's change to files a judged route does not render leaves its judgement valid", () => {
	git('checkout', '--', 'src', RECORD);
	git('clean', '-fdq', 'src');
	put('src/routes/a/+page.svelte', "<script>import { y } from '#lib/y.js';</script>\n<p>{y}</p>\n");
	put('src/lib/y.ts', 'export const y = 1;\n');
	put('src/routes/b/+page.svelte', "<script>import z from '$lib/z.svelte';</script>\n<z />\n");
	put('src/lib/z.svelte', '<p>z</p>\n');
	assert.equal(judge({ '/a': 'ship', '/b': 'ship' }).status, 0);
	// The landing merge folds in an unrelated lane's change to /b's component.
	put('src/lib/z.svelte', '<p>z, by another lane</p>\n');
	let r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/b changed and/);
	// /a was judged on files that did not move, so only /b is asked.
	assert.doesNotMatch(r.stderr, /\/a/);
	assert.equal(judge({ '/b': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	// A change a judged route renders through an import voids it.
	put('src/lib/y.ts', 'export const y = 2;\n');
	r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/a changed and/);
	assert.equal(judge({ '/a': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	// A computed import cannot be followed: the route is keyed on the whole tree.
	put('src/routes/b/+page.svelte', "<script>const m = import(name);</script>\n");
	assert.equal(judge({ '/a': 'ship', '/b': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	put('src/lib/unrelated.ts', 'export {};\n');
	r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/b changed and/);
	assert.equal(judge({ '/b': 'ship' }).status, 0);
	// A literal import.meta.glob names the files it pulls in; a computed one is opaque.
	put('src/routes/a/+page.svelte', "<script>const m = import.meta.glob('$lib/mods/*.ts');</script>\n");
	put('src/lib/mods/m.ts', 'export {};\n');
	put('src/routes/b/+page.svelte', '<p>b</p>\n');
	for (const f of ['src/lib/y.ts', 'src/lib/z.svelte', 'src/lib/unrelated.ts'])
		rmSync(path.join(fe, f), { force: true });
	assert.equal(judge({ '/a': 'ship', '/b': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	put('src/lib/mods/m.ts', 'export const m = 1;\n');
	assert.match(check().stderr, /\/a changed and/);
	assert.equal(judge({ '/a': 'ship' }).status, 0);
	put('src/lib/unrelated.ts', 'export const u = 2;\n');
	assert.match(check().stderr, /unrelated\.ts changed and no judged route renders it/);
	put('src/routes/a/+page.svelte', '<script>const m = import.meta.glob(pattern);</script>\n');
	assert.equal(judge({ '/a': 'ship', '/b': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	// Restore the base's shape for the tests that follow.
	git('checkout', '--', 'src', RECORD);
	git('clean', '-fdq', 'src');
});

test('no base in CI: refused until the tree as it stands is judged, at any verdict', () => {
	put('src/routes/a/+page.svelte', '<p>a, nothing judged of it</p>\n');
	const r = check({ CHANGE_BASE: '', CI: 'true' });
	assert.equal(r.status, 1);
	assert.match(r.stderr, /no base to measure the change from.*pnpm layout-gate \/ \/settings/);
	assert.equal(judge({ '/': 'fix' }).status, 0);
	assert.equal(check({ CHANGE_BASE: '', CI: 'true' }).status, 0);
	assert.equal(judge({ '/a': 'ship' }).status, 0);
	base = commit('judged, no base');
});

test('a factory update lands on a fix judgement, and is refused when a ship route turns fix', () => {
	// The base's record: /settings ships, / is the design backlog's, /a ships on its own tree.
	assert.equal(judge({ '/settings': 'ship', '/': 'fix' }).status, 0);
	base = commit('the record before the update');
	answers('v2');
	put('src/lib/x.ts', 'export const x = 3;\n');
	let r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/, \/settings show this factory update.*pnpm layout-gate \/ \/settings/);
	assert.equal(judge({ '/': 'fix', '/settings': 'ship' }).status, 0);
	assert.equal(check().status, 0);
	// A route never judged before, at fix, holds nothing either.
	assert.equal(judge({ '/new': 'fix' }).status, 0);
	assert.equal(check().status, 0);
	assert.equal(judge({ '/settings': 'fix' }).status, 0);
	r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/settings judges fix after this factory update and judged ship before it/);
	// The same tree as an app's own change (the _commit unmoved): / at fix holds it.
	answers('v1');
	assert.equal(judge({ '/settings': 'ship' }).status, 0);
	r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /judges? fix on this tree/);
	answers('v2');
	assert.equal(check().status, 0);
	// A factory page the update changed is judged with the shell's routes.
	put('src/routes/(protected)/settings/members/+page.svelte', '<p>members</p>\n');
	assert.equal(judge({ '/': 'fix', '/settings': 'ship' }).status, 0);
	r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/settings\/members shows this factory update/);
	assert.equal(judge({ '/settings/members': 'fix' }).status, 0);
	assert.equal(check().status, 0);
	base = commit('update to v2, judged');
});

test("a CI leg's one-commit checkout fetches the base and its record", () => {
	const was = base;
	put('src/lib/x.ts', 'export const x = 4;\n');
	assert.equal(judge({ '/': 'fix', '/settings': 'ship' }).status, 0);
	answers('v3');
	const head = commit('update to v3, judged');
	const clone = path.join(repo, 'clone');
	assert.equal(
		spawnSync('git', ['clone', '-q', '--depth=1', `file://${repo}`, clone]).status,
		0
	);
	const inClone = (...args) =>
		spawnSync(args[0], args.slice(1), {
			cwd: path.join(clone, 'frontend'),
			encoding: 'utf8',
			env: { ...process.env, ...NO_KEY, CHANGE_BASE: was, CI: 'true' }
		});
	assert.notEqual(inClone('git', 'cat-file', '-e', `${was}^{commit}`).status, 0);
	assert.equal(inClone('node', 'scripts/check-layout-gate.mjs').status, 0);
	// The base's record, read from the fetched base, holds /settings at ship.
	const file = path.join(clone, 'frontend', RECORD);
	const record = JSON.parse(readFileSync(file, 'utf8'));
	record.routes['/settings'].verdict = 'fix';
	writeFileSync(file, JSON.stringify(record));
	const r = inClone('node', 'scripts/check-layout-gate.mjs');
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/settings judges fix after this factory update/);
	rmSync(file);
	assert.equal(inClone('node', 'scripts/check-layout-gate.mjs').status, 1);
	rmSync(clone, { recursive: true, force: true });
	base = head;
});

test('a factory update compares verdicts on one prompt: a stricter judge is no regression', () => {
	// The base's record judged /settings ship on prompt p1.
	answers('v4');
	put('src/lib/x.ts', 'export const x = 5;\n');
	assert.equal(judge({ '/': 'fix', '/settings': 'fix' }, 'p2').status, 0);
	assert.equal(check().status, 0);
	assert.equal(judge({ '/settings': 'fix' }).status, 0);
	assert.match(
		check().stderr,
		/\/settings judges fix after this factory update and judged ship before it, on the same prompt/
	);
	// A base judged before the record carried its prompt counts as never judged.
	answers('v3');
	assert.equal(judge({ '/': 'fix', '/settings': 'ship' }, null).status, 0);
	base = commit('the record before the update, with no prompt');
	answers('v4');
	put('src/lib/x.ts', 'export const x = 6;\n');
	assert.equal(judge({ '/': 'fix', '/settings': 'fix' }).status, 0);
	assert.equal(check().status, 0);
	base = commit('update to v4, judged');
});

// `pnpm layout-gate` with Playwright stood in by a script that writes the report a run would.
const gate = (report, status) => {
	const bin = path.join(repo, 'bin');
	mkdirSync(bin, { recursive: true });
	writeFileSync(
		path.join(bin, 'playwright'),
		`#!/bin/sh\nmkdir -p test-results/layout-gate\necho '${JSON.stringify(report)}' > test-results/layout-gate/report.json\nexit ${status}\n`,
		{ mode: 0o755 }
	);
	return sh('node', ['scripts/layout-gate.mjs', '/a', '/b'], {
		PATH: `${bin}:${process.env.PATH}`
	});
};
const run = (a, b, more = {}) => ({
	judging: true,
	done: true,
	model: 'openai/sol',
	viewports: ['1920x1080', '390x844'],
	routes: [
		{
			path: '/a',
			verdict: a.filter((v) => v === 'ship').length >= 2 ? 'pass' : 'broken',
			prompt: 'p7',
			failures: [],
			samples: a.map((verdict, i) => ({ verdict, call: `c${i + 1}` }))
		},
		{ path: '/b', verdict: 'broken', prompt: 'p7', failures: b, samples: [] }
	],
	...more
});
const recorded = () => JSON.parse(readFileSync(path.join(fe, RECORD), 'utf8')).routes;

test('a finished judged run records every route, fix and measured faults included', () => {
	put('src/routes/a/+page.svelte', '<p>a, redrawn by the gate test</p>\n');
	const kept = recorded()['/settings'];
	const r = gate(run(['ship', 'fix', 'fix'], ['390 px: page scrolls sideways (by 12 px)']), 1);
	assert.equal(r.status, 1);
	const routes = recorded();
	assert.equal(routes['/a'].verdict, 'fix');
	assert.equal(routes['/a'].prompt, 'p7');
	assert.deepEqual(routes['/a'].samples, ['ship c1', 'fix c2', 'fix c3']);
	assert.equal(routes['/b'].verdict, 'fix');
	assert.deepEqual(routes['/b'].failures, ['390 px: page scrolls sideways (by 12 px)']);
	assert.deepEqual(routes['/settings'], kept);
	assert.notEqual(routes['/a'].tree, routes['/b'].tree);
	assert.notEqual(routes['/a'].tree, kept.tree);
	assert.match(check().stderr, /\/a judges fix on this tree/);
});

test('a dry run, an unfinished run or an unanswered sample records nothing', () => {
	put('src/routes/a/+page.svelte', '<p>a, redrawn once more</p>\n');
	const ship = run(['ship', 'ship', 'fix'], []);
	ship.routes.pop();
	assert.equal(gate({ ...ship, judging: false }, 0).status, 0);
	assert.equal(check().status, 1);
	assert.equal(gate({ ...ship, done: false }, 1).status, 1);
	assert.equal(check().status, 1);
	const error = run(['ship', 'ship', 'error'], []);
	error.routes.pop();
	const r = gate(error, 0);
	assert.match(r.stderr, /did not answer every sample for \/a/);
	assert.equal(check().status, 1);
	assert.equal(gate(ship, 0).status, 0);
	assert.equal(recorded()['/a'].verdict, 'ship');
	assert.equal(check().status, 0);
});

test('a deleted drawn file is a redraw', () => {
	const was = new Map([
		['src/a.ts', '1'],
		['src/b.ts', '2']
	]);
	assert.match(refusal(new Map([['src/a.ts', '1']]), was, null), /no judgement/);
	assert.equal(refusal(new Map(was), was, null), null);
});

test('a runner with the judge key judges a factory update once, and keeps the verdicts by repo and tree', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'layout-store-'));
	const keyFile = path.join(dir, 'key');
	const store = path.join(dir, 'store');
	const calls = path.join(dir, 'calls');
	const bin = path.join(dir, 'bin');
	mkdirSync(bin);
	writeFileSync(keyFile, 'k\n');
	// `pnpm layout-gate <routes>` stood in: records each route it is asked, at ship, and notes the call.
	writeFileSync(
		path.join(bin, 'pnpm'),
		`#!/bin/sh\necho "$LITELLM_URL $*" >> ${calls}\nshift\nnode --input-type=module -e "
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { RECORD, drawnFiles, routeKey } from './scripts/layout-gate.mjs';
const files = drawnFiles();
const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { routes: {} };
for (const r of process.argv.slice(1)) record.routes[r] = { tree: routeKey(files, r), prompt: 'p1', verdict: 'ship', samples: [] };
writeFileSync(RECORD, JSON.stringify(record));" "$@"\n`,
		{ mode: 0o755 }
	);
	const env = {
		CI: 'true',
		GITHUB_REPOSITORY: 'org/app',
		LAYOUT_GATE_KEY_FILE: keyFile,
		LAYOUT_GATE_STORE: store,
		PATH: `${bin}:${process.env.PATH}`
	};
	rmSync(path.join(fe, RECORD), { force: true });
	git('commit', '-qam', 'drop the record', '--allow-empty');
	const was = git('rev-parse', 'HEAD');
	answers('v9');
	put('src/lib/x.ts', 'export const x = 9;\n');
	const at = { ...env, CHANGE_BASE: was };
	let r = check(at);
	assert.equal(r.status, 0, r.stderr);
	assert.equal(readFileSync(calls, 'utf8').trim(), 'http://172.38.0.8:4000 layout-gate / /settings');
	// The push after the merge: no record committed, the same tree, no second judgement.
	rmSync(path.join(fe, RECORD), { force: true });
	r = check(at);
	assert.equal(r.status, 0, r.stderr);
	assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 1);
	// Another tree is judged afresh; an app's own change (the _commit unmoved) is never judged here.
	put('src/lib/x.ts', 'export const x = 10;\n');
	rmSync(path.join(fe, RECORD), { force: true });
	assert.equal(check(at).status, 0);
	assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 2);
	answers('v1');
	git('commit', '-qam', 'v1', '--allow-empty');
	put('src/lib/x.ts', 'export const x = 11;\n');
	rmSync(path.join(fe, RECORD), { force: true });
	r = check({ ...env, CHANGE_BASE: git('rev-parse', 'HEAD') });
	assert.equal(r.status, 1);
	assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 2);
	// No key file: the check behaves as before.
	answers('v9');
	rmSync(path.join(fe, RECORD), { force: true });
	r = check({ ...at, LAYOUT_GATE_KEY_FILE: path.join(dir, 'absent') });
	assert.equal(r.status, 1);
	rmSync(dir, { recursive: true, force: true });
});
