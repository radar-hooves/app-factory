/**
 * The arbitrary-value gate, tested against the holes that let real breaches
 * through the `grep` it replaces.
 *
 * Each case below is a shape measured in a consuming app on 02/09/2026 while
 * that app's CI was green. They are why this is a scanner, not a tighter regex.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { violationsIn } = await import('../bin/check-arbitrary-values.mjs');
const cli = fileURLToPath(new URL('../bin/check-arbitrary-values.mjs', import.meta.url));

/** The bodies the gate objected to, so a case asserts on WHAT it caught. */
const caught = (source) => violationsIn(source).map((v) => v.body);

test('catches the colour notations a palette exists to supply', () => {
	assert.deepEqual(caught('<p class="text-[#ff0000]">'), ['#ff0000']);
	assert.deepEqual(caught('<p class="bg-[rgb(1,2,3)]">'), ['rgb(1,2,3)']);
	assert.deepEqual(caught('<p class="bg-[hsl(1_2%_3%)]">'), ['hsl(1_2%_3%)']);
	assert.deepEqual(caught('<p class="bg-[oklch(0.5_0.1_260)]">'), ['oklch(0.5_0.1_260)']);
});

test('catches a hand-rolled tint — the color-mix() the grep had no pattern for', () => {
	// portcullis carried five of these at 4%/5%/10%/12%/16%, all green.
	const source = 'class="bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]"';
	assert.equal(caught(source).length, 1);
});

test('catches a ch measure — the value .ds-measure exists to supply', () => {
	// core-memory carried eleven `max-w-[70ch]`; the grep's unit list was px/rem/em.
	assert.deepEqual(caught('<p class="max-w-[70ch]">'), ['70ch']);
	assert.match(violationsIn('<p class="max-w-[70ch]">')[0].advice, /ds-measure/);
});

test('catches viewport lengths, and says plainly that no token answers them', () => {
	// godswood carried 85vh, 85dvh, 70vh, 60vh, 58vh, 56vh and 55vh for the same job.
	assert.deepEqual(caught('<div class="max-h-[85dvh] h-[55vh]">'), ['85dvh', '55vh']);
	assert.match(violationsIn('<div class="h-[55vh]">')[0].advice, /no viewport-length token/);
});

test('catches an arbitrary PROPERTY, which has no dash before the bracket', () => {
	assert.deepEqual(caught('<p class="[color:#ff0000]">'), ['color:#ff0000']);
	assert.deepEqual(caught('<p class="[padding:12px]">'), ['padding:12px']);
});

test('catches a leading-dot and a negative length', () => {
	assert.deepEqual(caught('<p class="p-[.5rem]">'), ['.5rem']);
	assert.deepEqual(caught('<p class="mt-[-4px]">'), ['-4px']);
});

test('passes a value that IS the token layer', () => {
	assert.deepEqual(caught('<p class="bg-[var(--ds-color-primary)]">'), []);
	assert.deepEqual(caught('<p class="max-w-[--ds-shell-measure-prose]">'), []);
	assert.deepEqual(caught('<p class="[color:var(--ds-color-primary)]">'), []);
});

test('passes a layout expression, whose lengths have no token to reach for', () => {
	assert.deepEqual(caught('<div class="grid-cols-[minmax(0,20rem)_1fr]">'), []);
	assert.deepEqual(caught('<div class="h-[calc(100dvh-19rem)]">'), []);
	assert.deepEqual(caught('<div class="grid-cols-[repeat(3,12rem)]">'), []);
});

test('a colour inside a layout expression is still a colour', () => {
	assert.equal(caught('<div class="bg-[min(#fff,#000)]">').length, 1);
});

test('passes brackets that are not Tailwind values at all', () => {
	assert.deepEqual(caught("const x = rows[0];\nconst y = ['12px'];"), []);
	assert.deepEqual(caught('<a href="/routes/[id]/edit">'), []);
});

/** Build a throwaway source tree and run the CLI in it. */
function runIn(files, args = ['src']) {
	const dir = mkdtempSync(join(tmpdir(), 'ds-arb-'));
	try {
		for (const [path, body] of Object.entries(files)) {
			const full = join(dir, path);
			mkdirSync(join(full, '..'), { recursive: true });
			writeFileSync(full, body);
		}
		try {
			const stdout = execFileSync(process.execPath, [cli, ...args], {
				cwd: dir,
				encoding: 'utf8'
			});
			return { status: 0, output: stdout };
		} catch (error) {
			return { status: error.status, output: `${error.stdout}${error.stderr}` };
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test('exempts vendored primitives by PATH, not by line content', () => {
	// `grep -v 'lib/components/ui/'` filtered the matching LINE, so a line
	// merely naming that path was exempted wherever it lived.
	const vendored = runIn({ 'src/lib/components/ui/button/index.ts': 'class="text-[#f00]"' });
	assert.equal(vendored.status, 0, vendored.output);

	const impostor = runIn({
		'src/routes/+page.svelte': '<p class="text-[#f00]"><!-- lib/components/ui/ --></p>'
	});
	assert.equal(impostor.status, 1);
	assert.match(impostor.output, /#f00/);
});

test('fails when it cannot run, rather than reporting nothing to do', () => {
	const missing = runIn({ 'src/keep.ts': 'export const a = 1;' }, ['does-not-exist']);
	assert.equal(missing.status, 1);
	assert.match(missing.output, /no such source root/);

	const empty = runIn({ 'src/notes/readme.md': '# nothing scannable here' });
	assert.equal(empty.status, 1);
	assert.match(empty.output, /the gate did not run/);
});

test('a pass proves it could have acted, by naming the file count', () => {
	const clean = runIn({ 'src/routes/+page.svelte': '<p class="text-sm p-4">ok</p>' });
	assert.equal(clean.status, 0, clean.output);
	assert.match(clean.output, /1 files scanned/);
});

test('reports the file and line a breach sits on', () => {
	const hit = runIn({ 'src/routes/+page.svelte': '<p>\n</p>\n<p class="text-[#abc]">' });
	assert.equal(hit.status, 1);
	assert.match(hit.output, /src\/routes\/\+page\.svelte:3/);
});
