#!/usr/bin/env node
/**
 * Fail when an app carries a layout of its own.
 *
 * The factory owns the rail, the sidebar and the page frames; an app declares
 * data (src/lib/shell.ts) and each route its `pageType` (operator ruling,
 * 03/11/2026: "apps just stop inventing their own layouts and instead they get
 * forced to use one from the app factory"). This reads the source, so it runs
 * in the unit leg every app already runs (src/lib/layout-ownership.test.ts) and
 * as `pnpm lint:layout`, with no browser and no database.
 *
 * Three rules, each a finding the app must remove, never baseline:
 *   1. own-shell: the shell (`AppShell`) composed anywhere but the factory's
 *      frame, or shell chrome (a `ds-shell-*` / `ds-page-*` class, `#ds-main`)
 *      written by hand.
 *   2. own-page-frame: a route sizing or centring its own page (`max-w-*`,
 *      `mx-auto`, `container`, `w-screen`, `h-screen`, `min-h-screen`, or a
 *      `<style>` setting a page `max-width`): the page type owns every width,
 *      gutter and column.
 *   3. page-type: a route declaring a `pageType` the factory does not have.
 *
 * Usage:  node scripts/check-layout-ownership.mjs [--json]
 * Exit:   0 clean · 1 findings
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The factory's page types (@poodle64/ui/app-shell `PAGE_TYPES`). */
export const PAGE_TYPES = ['reading', 'panel', 'tool', 'bare'];

// The only files that may compose the shell: the frame, and the factory's own
// self-test stub beside it.
const SHELL_OWNERS = new Set(['src/lib/app-frame.svelte']);

const WIDTH_CLASS =
	/(?<![\w-])(?:[a-z0-9]+:)*(?:max-w-(?!none)[\w./[\]-]+|mx-auto|container|w-screen|h-screen|min-h-screen|min-w-screen)(?![\w-])/;
const PAGE_MAX_WIDTH_RULE = /(?:^|[\s;{])max-width\s*:/;

/**
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
function walk(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

/** @param {string} rel */
const isTest = (rel) => /\.(test|spec)\.[jt]s$/.test(rel) || rel.startsWith('src/test/');

/**
 * Findings under `root` (the frontend directory).
 * @param {string} [root]
 * @returns {{ rule: string, file: string, detail: string }[]}
 */
export function findViolations(root = FRONTEND_ROOT) {
	/** @type {{ rule: string, file: string, detail: string }[]} */
	const findings = [];
	const src = path.join(root, 'src');
	for (const full of walk(src)) {
		const rel = path.relative(root, full).split(path.sep).join('/');
		if (isTest(rel)) continue;
		const isSvelte = rel.endsWith('.svelte');
		const isSource = isSvelte || /\.(ts|js)$/.test(rel);
		if (!isSource) continue;
		const text = readFileSync(full, 'utf8');

		if (
			!SHELL_OWNERS.has(rel) &&
			/import\s*{[^}]*\bAppShell\b[^}]*}\s*from\s*['"]@poodle64\/ui\/app-shell['"]/.test(text)
		) {
			findings.push({
				rule: 'own-shell',
				file: rel,
				detail:
					'composes AppShell; the factory frame (src/lib/app-frame.svelte) is the one shell, fed by src/lib/shell.ts'
			});
		}
		if (
			isSvelte &&
			!SHELL_OWNERS.has(rel) &&
			/\b(?:ds-shell-[a-z-]+|ds-page-[a-z-]+|id="ds-main")/.test(text)
		) {
			findings.push({
				rule: 'own-shell',
				file: rel,
				detail: 'writes the shell’s own chrome (a ds-shell-*/ds-page-* class or #ds-main) by hand'
			});
		}

		if (/^src\/routes\/.*\+(?:page|layout)\.svelte$/.test(rel)) {
			const markup = text
				.replace(/<script[\s\S]*?<\/script>/g, '')
				.replace(/<style[\s\S]*?<\/style>/g, '');
			const match = WIDTH_CLASS.exec(markup);
			if (match) {
				findings.push({
					rule: 'own-page-frame',
					file: rel,
					detail: `sizes or centres its own page (\`${match[0]}\`); declare a pageType, the frame owns widths, gutters and columns`
				});
			}
			const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
			if (styles.some((css) => PAGE_MAX_WIDTH_RULE.test(css))) {
				findings.push({
					rule: 'own-page-frame',
					file: rel,
					detail:
						'a <style> sets a max-width on its page; declare a pageType, the frame owns widths'
				});
			}
		}

		if (/^src\/routes\/.*\+(?:page|layout)\.(?:ts|js)$/.test(rel)) {
			for (const m of text.matchAll(/\bpageType\s*:\s*(['"`])([^'"`]*)\1/g)) {
				if (!PAGE_TYPES.includes(m[2] ?? '')) {
					findings.push({
						rule: 'page-type',
						file: rel,
						detail: `pageType '${m[2] ?? ''}' is not one of the factory's: ${PAGE_TYPES.join(', ')}`
					});
				}
			}
		}
	}
	return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const findings = findViolations();
	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(findings, null, 2));
	} else if (findings.length > 0) {
		console.error(`layout ownership: ${findings.length} finding(s)\n`);
		for (const f of findings) console.error(`  ${f.rule}  ${f.file}\n    ${f.detail}`);
		console.error('\nThe factory owns the layout; an app declares data. See src/lib/shell.ts.');
	} else {
		console.log('layout ownership: clean');
	}
	process.exit(findings.length > 0 ? 1 : 0);
}
