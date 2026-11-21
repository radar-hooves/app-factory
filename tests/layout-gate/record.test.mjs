// The judgement record: what the change pipeline refuses, driven against a real git repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { refusal } from '../../template/frontend/scripts/check-layout-gate.mjs';

const SCRIPTS = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../template/frontend/scripts'
);
let repo, fe, base;

const sh = (cmd, args, env = {}) =>
	spawnSync(cmd, args, { cwd: fe, encoding: 'utf8', env: { ...process.env, ...env } });
const git = (...args) => {
	const r = sh('git', args);
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
};
const put = (file, text) => {
	mkdirSync(path.dirname(path.join(fe, file)), { recursive: true });
	writeFileSync(path.join(fe, file), text);
};
const check = (env = { CHANGE_BASE: base, CI: 'true' }) =>
	sh('node', ['scripts/check-layout-gate.mjs'], env);
// The record the gate writes on a pass, for the tree as it stands.
const judge = (routes) =>
	sh('node', [
		'--input-type=module',
		'-e',
		`import { writeFileSync } from 'node:fs';
		 import { RECORD, drawnFiles, treeKey } from './scripts/layout-gate.mjs';
		 writeFileSync(RECORD, JSON.stringify({ tree: treeKey(drawnFiles()), routes: ${JSON.stringify(routes)} }));`
	]);

before(() => {
	repo = mkdtempSync(path.join(tmpdir(), 'layout-record-'));
	fe = path.join(repo, 'frontend');
	mkdirSync(fe);
	cpSync(SCRIPTS, path.join(fe, 'scripts'), { recursive: true });
	assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
	git('config', 'user.email', 'selftest@invalid');
	git('config', 'user.name', 'selftest');
	put('src/routes/a/+page.svelte', '<p>a</p>\n');
	put('src/lib/x.ts', 'export const x = 1;\n');
	put('src/lib/x.test.ts', 'test\n');
	git('add', '.');
	git('commit', '-qm', 'base');
	base = git('rev-parse', 'HEAD');
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

test('a record of this tree covering the route lets it land, committed or not', () => {
	assert.equal(judge({ '/a': ['ship c1', 'ship c2', 'fix c3'] }).status, 0);
	assert.equal(check().status, 0);
	git('add', '.');
	git('commit', '-qm', 'redraw a, judged');
	assert.equal(check().status, 0);
});

test('a record that does not judge the changed route is refused', () => {
	assert.equal(judge({ '/b': ['ship c1', 'ship c2', 'ship c3'] }).status, 0);
	const r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /\/a changed/);
});

test('src/ changed after the judgement: refused', () => {
	assert.equal(judge({ '/a': ['ship c1', 'ship c2', 'ship c3'] }).status, 0);
	put('src/lib/x.ts', 'export const x = 2;\n');
	const r = check();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /judged another tree/);
});

test('no base in CI: nothing ships, so not asked', () => {
	assert.equal(check({ CHANGE_BASE: '', CI: 'true' }).status, 0);
});

test("a CI leg's one-commit checkout fetches the base it is measured from", () => {
	assert.equal(judge({ '/a': ['ship c1', 'ship c2', 'ship c3'] }).status, 0);
	git('add', '.');
	git('commit', '-qm', 'judged again');
	const clone = path.join(repo, 'clone');
	assert.equal(
		spawnSync('git', ['clone', '-q', '--depth=1', `file://${repo}`, clone]).status,
		0
	);
	const inClone = (...args) =>
		spawnSync(args[0], args.slice(1), {
			cwd: path.join(clone, 'frontend'),
			encoding: 'utf8',
			env: { ...process.env, CHANGE_BASE: base, CI: 'true' }
		});
	assert.notEqual(inClone('git', 'cat-file', '-e', `${base}^{commit}`).status, 0);
	assert.equal(inClone('node', 'scripts/check-layout-gate.mjs').status, 0);
	rmSync(path.join(clone, 'frontend/.layout-gate-record.json'));
	assert.equal(inClone('node', 'scripts/check-layout-gate.mjs').status, 1);
});

// `pnpm layout-gate` with Playwright stood in by a script that writes the report a run would.
const gate = (judging, status) => {
	const bin = path.join(repo, 'bin');
	mkdirSync(bin, { recursive: true });
	const report = {
		judging,
		model: 'openai/sol',
		viewports: ['1920x1080', '390x844'],
		routes: [
			{
				path: '/a',
				samples: [
					{ verdict: 'ship', call: 'c1' },
					{ verdict: 'fix', call: 'c2' },
					{ verdict: 'ship', call: 'c3' }
				]
			}
		]
	};
	writeFileSync(
		path.join(bin, 'playwright'),
		`#!/bin/sh\nmkdir -p test-results/layout-gate\necho '${JSON.stringify(report)}' > test-results/layout-gate/report.json\nexit ${status}\n`,
		{ mode: 0o755 }
	);
	rmSync(path.join(fe, '.layout-gate-record.json'), { force: true });
	return sh('node', ['scripts/layout-gate.mjs', '/a'], { PATH: `${bin}:${process.env.PATH}` });
};

test('a judged pass writes the record the check accepts; a dry run or a failure writes none', () => {
	put('src/routes/a/+page.svelte', '<p>a, redrawn by the gate test</p>\n');
	assert.equal(gate(false, 0).status, 0);
	assert.equal(check().status, 1);
	assert.equal(gate(true, 1).status, 1);
	assert.equal(check().status, 1);
	assert.equal(gate(true, 0).status, 0);
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
