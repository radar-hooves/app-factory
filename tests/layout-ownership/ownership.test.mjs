// The layout-ownership gate: what it refuses, and that it leaves an app that
// only declares data alone.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { findViolations } from '../../template/frontend/scripts/check-layout-ownership.mjs';

function app(files) {
	const root = mkdtempSync(path.join(tmpdir(), 'ownership-'));
	for (const [rel, text] of Object.entries(files)) {
		const full = path.join(root, rel);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
	return root;
}

const rules = (root) => findViolations(root).map((f) => `${f.rule} ${f.file}`);

test('an app that declares data and picks page types is clean', () => {
	const root = app({
		'src/lib/app-frame.svelte': `<script>import { AppShell } from '@poodle64/ui/app-shell';</script>`,
		'src/lib/shell.ts': `export const shell = {};`,
		'src/routes/(protected)/a/+page.ts': `export const load = () => ({ pageType: 'tool' });`,
		'src/routes/(protected)/a/+page.svelte': `<div class="grid gap-4 md:grid-cols-2">x</div>`
	});
	assert.deepEqual(rules(root), []);
});

test('composing the shell outside the frame is refused', () => {
	const root = app({
		'src/lib/own-frame.svelte': `<script>import { AppShell } from '@poodle64/ui/app-shell';</script>`
	});
	assert.deepEqual(rules(root), ['own-shell src/lib/own-frame.svelte']);
});

test('hand-written shell chrome is refused', () => {
	const root = app({
		'src/routes/x/+page.svelte': `<main id="ds-main" class="ds-page-main"></main>`
	});
	assert.deepEqual(rules(root), ['own-shell src/routes/x/+page.svelte']);
});

test('a route sizing or centring its own page is refused, wherever the class sits', () => {
	for (const cls of ['max-w-3xl mx-auto', 'md:max-w-prose', 'container', 'min-h-screen']) {
		const root = app({ 'src/routes/x/+page.svelte': `<div class="p-4 ${cls}">x</div>` });
		assert.deepEqual(rules(root), ['own-page-frame src/routes/x/+page.svelte'], cls);
	}
	const styled = app({
		'src/routes/x/+layout.svelte': `<div>x</div>\n<style>\n.page { max-width: 60rem; }\n</style>`
	});
	assert.deepEqual(rules(styled), ['own-page-frame src/routes/x/+layout.svelte']);
});

test('a width on something inside the page is content, not the page’s frame', () => {
	const root = app({
		'src/routes/x/+page.svelte': `<div class="space-y-4"><Input class="max-w-sm" /><p class="max-w-prose mx-auto">Drop it in the container</p></div>`
	});
	assert.deepEqual(rules(root), []);
});

test('a container query is not the container class, and a rule inside the page is content', () => {
	const root = app({
		'src/routes/x/+page.svelte': `<div class="@container grid @lg:grid-cols-2 gap-4"><p class="note">x</p></div>
<style>
	.note { max-width: 40ch; }
	.grid p { max-inline-size: 30ch; }
	@media (min-width: 40rem) { .note { max-width: 50ch; } }
</style>`
	});
	assert.deepEqual(rules(root), []);
});

test('a width set on the page’s own element or on main is refused, whichever property', () => {
	for (const css of [
		'.wide { max-inline-size: 70rem; }',
		':global(main) { max-width: 70rem; }',
		'.page { max-width: 70rem; }'
	]) {
		const root = app({
			'src/routes/x/+page.svelte': `<section class="wide">x</section>\n<style>\n${css}\n</style>`
		});
		assert.deepEqual(rules(root), ['own-page-frame src/routes/x/+page.svelte'], css);
	}
});

test('an inline style framing the page is refused', () => {
	const root = app({ 'src/routes/x/+page.svelte': `<div style="max-width: 60rem; margin: 0 auto">x</div>` });
	assert.deepEqual(rules(root), ['own-page-frame src/routes/x/+page.svelte']);
});

test('a server load with an unknown page type is refused, and a namespace import of the shell too', () => {
	const root = app({
		'src/routes/x/+page.server.ts': `export const load = () => ({ pageType: 'wide' });`,
		'src/lib/y.svelte': `<script>import * as S from '@poodle64/ui/app-shell';</script>`,
		'src/app.d.ts': `import type { PageType } from '@poodle64/ui/app-shell';\n// AppShell pageType`
	});
	assert.deepEqual(rules(root).sort(), ['own-shell src/lib/y.svelte', 'page-type src/routes/x/+page.server.ts']);
});

test('a width inside a component is the component’s, not the page’s', () => {
	const root = app({ 'src/lib/card.svelte': `<div class="max-w-sm mx-auto">x</div>` });
	assert.deepEqual(rules(root), []);
});

test('a page type the factory does not have is refused', () => {
	const root = app({
		'src/routes/x/+page.ts': `export const load = () => ({ pageType: 'dashboard' });`,
		'src/routes/y/+layout.ts': `export const load = () => ({ pageType: "panel" });`
	});
	assert.deepEqual(rules(root), ['page-type src/routes/x/+page.ts']);
});

test('tests are not scanned', () => {
	const root = app({
		'src/lib/x.test.ts': `import { AppShell } from '@poodle64/ui/app-shell';`
	});
	assert.deepEqual(rules(root), []);
});
