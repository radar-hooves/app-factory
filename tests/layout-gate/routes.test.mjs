// Which routes a change names for the layout gate, and when it refuses to guess.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routesFromChanges } from '../../template/frontend/scripts/layout-gate.mjs';

const SCRIPT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../template/frontend/scripts/layout-gate.mjs'
);

test('page files name their routes; groups vanish; root is /', () => {
	const r = routesFromChanges([
		'src/routes/+page.svelte',
		'src/routes/(app)/library/+page.svelte',
		'src/routes/(app)/library/+page.ts',
		'src/routes/settings/+page.svelte'
	]);
	assert.deepEqual(r.routes, ['/', '/library', '/settings']);
	assert.deepEqual(r.shared, []);
});

test('shared files and layouts name no route', () => {
	const r = routesFromChanges([
		'src/lib/app-frame.svelte',
		'src/routes/+layout.svelte',
		'src/app.css'
	]);
	assert.deepEqual(r.routes, []);
	assert.equal(r.shared.length, 3);
});

test('a [param] route is unresolved; tests and non-src files are ignored', () => {
	const r = routesFromChanges([
		'src/routes/book/[id]/+page.svelte',
		'src/lib/x.test.ts',
		'package.json'
	]);
	assert.deepEqual(r.routes, []);
	assert.equal(r.unresolved.length, 1);
	assert.deepEqual(r.shared, []);
});

test('named routes and --list gate exactly those, running nothing', () => {
	const r = spawnSync('node', [SCRIPT, '/a', '/b', '--list'], { encoding: 'utf8' });
	assert.equal(r.status, 0);
	assert.match(r.stdout, /layout-gate: \/a, \/b/);
});

test('an argument that is not a route is refused', () => {
	const r = spawnSync('node', [SCRIPT, 'library', '--list'], { encoding: 'utf8' });
	assert.equal(r.status, 2);
});
