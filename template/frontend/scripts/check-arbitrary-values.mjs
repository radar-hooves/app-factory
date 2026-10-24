#!/usr/bin/env node
/**
 * Fail on a NEW colour or size literal in an arbitrary Tailwind value.
 *
 * Wraps @poodle64/design-tokens' `ds-check-arbitrary-values`, which scans the
 * whole tree and has no baseline, so an app with literals from before the gate
 * landed could not commit any frontend change. This ratchets the bin's output
 * against `.arbitrary-values-baseline.json`, the way check-ui-drift.mjs does:
 * the debt is banked, may only fall, and anything beyond it fails.
 *
 * The baseline maps `<file> [<value>]` to how many times that value appears in
 * that file. No line numbers: an unrelated edit must not re-flag a literal that
 * never changed.
 *
 * No baseline file means no debt: a clean tree passes, a tree with literals
 * fails and is told to bank them. Once the file exists, `--baseline` only drops
 * what was fixed; it never banks a new literal.
 *
 * Usage:  node scripts/check-arbitrary-values.mjs [--baseline]
 * Exit:   0 clean · 1 new literal · 2 could not run
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(FRONTEND_ROOT, 'node_modules/.bin/ds-check-arbitrary-values');
const BASELINE = path.join(FRONTEND_ROOT, '.arbitrary-values-baseline.json');
const NAME = path.basename(BASELINE);

if (!existsSync(BIN)) {
	console.error('@poodle64/design-tokens is not installed; run pnpm install in frontend first.');
	process.exit(2);
}

const run = spawnSync(BIN, ['src'], { cwd: FRONTEND_ROOT, encoding: 'utf8' });
if (run.error) {
	console.error(`Could not run ds-check-arbitrary-values: ${run.error.message}`);
	process.exit(2);
}

// A hit prints as `  <file>:<line>  [<body>]` then an advice line. The count
// in the header must equal the hits parsed, or the output changed shape and the
// gate would be passing on a parse it cannot trust.
const hits = [];
const lines = run.stderr.split('\n');
for (let i = 0; i < lines.length; i++) {
	const m = /^ {2}(.+?):(\d+) {2}\[(.*)\]$/.exec(lines[i]);
	if (m) hits.push({ file: m[1], line: Number(m[2]), body: m[3], advice: lines[i + 1]?.trim() });
}
const header = /Hand-written colour or size literals \((\d+)\)/.exec(run.stderr);
if (run.status !== 0 && (!header || Number(header[1]) !== hits.length)) {
	process.stderr.write(run.stderr);
	console.error('ds-check-arbitrary-values failed in a way this wrapper cannot read.');
	process.exit(2);
}
if (run.status === 0 && hits.length) process.exit(2);

const key = (h) => `${h.file} [${h.body}]`;
const current = {};
for (const h of hits) current[key(h)] = (current[key(h)] ?? 0) + 1;

const hasBaseline = existsSync(BASELINE);
const banked = hasBaseline ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const over = (k) => (current[k] ?? 0) - (banked[k] ?? 0);
const freshKeys = Object.keys(current).filter((k) => over(k) > 0);
const fixedKeys = Object.keys(banked).filter((k) => (current[k] ?? 0) < banked[k]);

const write = (map) =>
	writeFileSync(
		BASELINE,
		JSON.stringify(
			Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1))),
			null,
			2
		) + '\n'
	);

if (process.argv.includes('--baseline')) {
	// Only an app with no baseline file banks its whole backlog, once.
	const next = {};
	for (const k of Object.keys(current)) {
		const n = hasBaseline ? Math.min(current[k], banked[k] ?? 0) : current[k];
		if (n > 0) next[k] = n;
	}
	write(next);
	const total = Object.values(next).reduce((a, b) => a + b, 0);
	console.log(
		`Baseline written: ${total} literal(s) in ${Object.keys(next).length} entries in ${NAME}`
	);
	if (hasBaseline && freshKeys.length) {
		for (const k of freshKeys) console.error(`Not banked, fix it: ${k}`);
		process.exit(1);
	}
	process.exit(0);
}

if (!hasBaseline && hits.length) {
	console.error(
		`${hits.length} colour/size literal(s) and no ${NAME}. Bank the existing ones once with\n` +
			'  node scripts/check-arbitrary-values.mjs --baseline\nthen commit it; the gate fails only on new ones.'
	);
	process.exit(1);
}

if (freshKeys.length) {
	for (const h of hits.filter((h) => freshKeys.includes(key(h)))) {
		console.error(`${h.file}:${h.line}  [${h.body}]\n  ${h.advice ?? ''}`);
	}
	console.error(
		`\n${freshKeys.length} NEW hand-written colour or size literal(s) in arbitrary values.`
	);
	process.exit(1);
}

const total = Object.values(banked).reduce((a, b) => a + b, 0);
console.log(`No new arbitrary-value literals. (${total} banked in ${NAME}.)`);
if (fixedKeys.length) {
	console.log(
		`${fixedKeys.length} banked entr(ies) fixed; rerun with --baseline to bank the fall.`
	);
}
