// The ratchet around ds-check-arbitrary-values, run against the real bin.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'template/frontend/scripts/check-arbitrary-values.mjs');
const BIN = path.join(ROOT, 'kits/typescript/packages/design-tokens/bin/check-arbitrary-values.mjs');

function app(files) {
	const fe = path.join(mkdtempSync(path.join(tmpdir(), 'arb-')), 'frontend');
	mkdirSync(path.join(fe, 'scripts'), { recursive: true });
	mkdirSync(path.join(fe, 'node_modules/.bin'), { recursive: true });
	cpSync(SCRIPT, path.join(fe, 'scripts/check-arbitrary-values.mjs'));
	symlinkSync(BIN, path.join(fe, 'node_modules/.bin/ds-check-arbitrary-values'));
	const put = (map) => {
		for (const [f, text] of Object.entries(map)) {
			mkdirSync(path.dirname(path.join(fe, f)), { recursive: true });
			writeFileSync(path.join(fe, f), text);
		}
	};
	put(files);
	const run = (...args) =>
		spawnSync('node', ['scripts/check-arbitrary-values.mjs', ...args], {
			cwd: fe,
			encoding: 'utf8'
		});
	const baseline = () =>
		JSON.parse(readFileSync(path.join(fe, '.arbitrary-values-baseline.json'), 'utf8'));
	return { fe, put, run, baseline };
}

const OLD = { 'src/old.svelte': '<div class="h-[12px] bg-[#fff]"></div>\n' };

test('a clean tree passes with no baseline file', () => {
	const a = app({ 'src/a.svelte': '<div class="p-4"></div>\n' });
	assert.equal(a.run().status, 0);
	assert.equal(existsSync(path.join(a.fe, '.arbitrary-values-baseline.json')), false);
});

test('literals with no baseline fail and say how to bank them', () => {
	const r = app(OLD).run();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /--baseline/);
});

test('--baseline banks the backlog once, then the old literals pass', () => {
	const a = app(OLD);
	assert.equal(a.run('--baseline').status, 0);
	assert.deepEqual(a.baseline(), { 'src/old.svelte [#fff]': 1, 'src/old.svelte [12px]': 1 });
	assert.equal(a.run().status, 0);
});

test('a banked file does not block; a new literal does', () => {
	const a = app(OLD);
	a.run('--baseline');
	a.put({ 'src/new.svelte': '<div class="w-[300px]"></div>\n' });
	const r = a.run();
	assert.equal(r.status, 1);
	assert.match(r.stderr, /src\/new\.svelte:1/);
	assert.doesNotMatch(r.stderr, /old\.svelte/);
});

test('a second copy of a banked literal is new', () => {
	const a = app(OLD);
	a.run('--baseline');
	a.put({ 'src/old.svelte': '<div class="h-[12px] bg-[#fff]"></div><i class="h-[12px]"></i>\n' });
	assert.equal(a.run().status, 1);
});

test('moving a banked literal to another line passes', () => {
	const a = app(OLD);
	a.run('--baseline');
	a.put({ 'src/old.svelte': '\n\n<div class="h-[12px] bg-[#fff]"></div>\n' });
	assert.equal(a.run().status, 0);
});

test('--baseline shrinks on a fix and never banks a new literal', () => {
	const a = app(OLD);
	a.run('--baseline');
	a.put({
		'src/old.svelte': '<div class="bg-[#fff]"></div>\n',
		'src/new.svelte': '<div class="w-[300px]"></div>\n'
	});
	assert.equal(a.run('--baseline').status, 1);
	assert.deepEqual(a.baseline(), { 'src/old.svelte [#fff]': 1 });
});

test('a missing bin is could-not-run, not a pass', () => {
	const a = app(OLD);
	rmSync(path.join(a.fe, 'node_modules/.bin/ds-check-arbitrary-values'));
	assert.equal(a.run().status, 2);
});

test('a missing src is could-not-run, not a pass', () => {
	assert.equal(app({}).run().status, 2);
});
