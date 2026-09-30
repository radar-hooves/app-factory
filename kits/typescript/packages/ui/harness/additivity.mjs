/**
 * The cross-build additivity gate.
 *
 * This package makes the same promise on every additive change: no consumer
 * that does not opt in may render one pixel differently. The permanent gates
 * hold half of that — `src/test/*.test.ts` pins the DOM contract, `drive.mjs`
 * pins the resolved paint — but neither can compare against a build that no
 * longer exists, so the cross-build half was done by hand for `level` (2026.7),
 * for `children` (2026.8.1) and for `measure` (2026.8.3), and written up as
 * prose each time.
 *
 * Prose is where that claim went to die. `drive.md` carried "all nine pairs
 * identical on all ten fields" with no way for the next reader to re-derive it,
 * which adversarial review correctly called an unverifiable claim as shipped.
 * So the procedure is a script: it builds the package at a base ref in a
 * throwaway git worktree, captures the surfaces an existing consumer already
 * has, captures the same surfaces on the working tree's build, and diffs the
 * markup, the computed box and background properties, the geometry AND the
 * rendered pixels.
 *
 *     node harness/additivity.mjs                # against the previous commit
 *     node harness/additivity.mjs ui-v2026.8.3   # against a released tag
 *
 * Exits non-zero on any difference. It is deliberately NOT wired into
 * `pnpm test`: it builds a second copy of the package and installs into a
 * worktree, which is minutes rather than seconds, and it is meaningful only on
 * a change claiming to be additive. Run it before releasing one.
 *
 * The surfaces below are the ones a consumer gets WITHOUT naming any opt-in
 * prop. Adding an opt-in surface here would defeat the point: the question is
 * only ever what happens to somebody who did not ask.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const repoRoot = join(packageRoot, '..', '..');
const baseRef = process.argv[2] ?? 'HEAD~1';
const PORT = 4186;

/** The surfaces an existing consumer already renders, at the widths that bite. */
const SURFACES = ['shell', 'shell&pagenav=1', 'overflow', 'nested', 'measure&measure=page'];
const WIDTHS = [2560, 1440, 360];

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.map': 'application/json'
};

const run = (command, args, cwd) =>
	execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });

/**
 * Capture every surface/viewport pair against one already-built `harness/dist`.
 *
 * Everything read here is something an additive change could plausibly move: the
 * markup, both attribute sets, the scroller's whole background shorthand (the
 * surface THIS feature touches), the box properties `measure` touches, the
 * geometry, and the pixels. A field is cheap; a missed field is a false green.
 */
async function capture(distDir, browser) {
	const server = createServer((request, response) => {
		const path = decodeURIComponent(request.url.split('?')[0]);
		let file = join(distDir, path);
		if (path === '/') file = join(distDir, 'index.html');
		if (!existsSync(file) || statSync(file).isDirectory()) {
			response.statusCode = 404;
			response.end('not found');
			return;
		}
		response.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
		response.end(readFileSync(file));
	});
	await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

	const record = {};
	for (const surface of SURFACES) {
		for (const width of WIDTHS) {
			const key = `${surface.replace(/[&=]/g, '-')}@${width}`;
			// `reducedMotion` and a fixed scale factor are not cosmetic: a drawer
			// mid-animation or a retina scale difference would read as a pixel
			// difference the change did not cause.
			const context = await browser.newContext({
				viewport: { width, height: 900 },
				colorScheme: 'light',
				reducedMotion: 'reduce',
				deviceScaleFactor: 1
			});
			const page = await context.newPage();
			await page.goto(`http://127.0.0.1:${PORT}/index.html?surface=${surface}`, {
				waitUntil: 'load'
			});
			await page.waitForSelector('#ds-main');
			await page.evaluate(() => document.fonts.ready);

			record[key] = await page.evaluate(() => {
				const main = document.querySelector('#ds-main');
				const box = main.firstElementChild;
				const pick = (style, keys) => Object.fromEntries(keys.map((k) => [k, style[k]]));
				const rect = box.getBoundingClientRect();
				const mainRect = main.getBoundingClientRect();
				return {
					mainOuterHTML: main.outerHTML,
					mainAttributes: Object.fromEntries([...main.attributes].map((a) => [a.name, a.value])),
					boxAttributes: Object.fromEntries([...box.attributes].map((a) => [a.name, a.value])),
					mainComputed: pick(getComputedStyle(main), [
						'backgroundImage',
						'backgroundColor',
						'backgroundSize',
						'backgroundRepeat',
						'backgroundAttachment',
						'backgroundPosition',
						'position',
						'overflowX',
						'overflowY',
						'display',
						'flexDirection',
						'isolation',
						'zIndex'
					]),
					boxComputed: pick(getComputedStyle(box), [
						'maxWidth',
						'marginLeft',
						'marginRight',
						'paddingTop',
						'paddingBottom',
						'paddingLeft',
						'paddingRight',
						'backgroundImage'
					]),
					geometry: {
						boxWidth: Math.round(rect.width * 100) / 100,
						boxHeight: Math.round(rect.height * 100) / 100,
						gapLeft: Math.round((rect.left - mainRect.left) * 100) / 100,
						gapRight: Math.round((mainRect.right - rect.right) * 100) / 100,
						mainClient: main.clientWidth,
						mainScrollW: main.scrollWidth,
						mainScrollH: main.scrollHeight,
						mainChildren: main.children.length
					}
				};
			});
			record[key].screenshot = createHash('sha256')
				.update(await page.screenshot({ fullPage: false }))
				.digest('hex');
			await context.close();
		}
	}

	server.close();
	return record;
}

let worktree;
let browser;
try {
	worktree = mkdtempSync(join(tmpdir(), 'ds-additivity-'));
	console.log(`building the base at ${baseRef} in ${worktree}`);
	run('git', ['worktree', 'add', '--detach', worktree, baseRef], repoRoot);
	// A full install rather than borrowing this checkout's node_modules: the
	// borrowed tree's workspace links resolve back into THIS checkout, so the
	// "base" build would silently be built against current sources.
	run('pnpm', ['install', '--frozen-lockfile'], worktree);
	// The WHOLE workspace, not just `ui`: the harness compiles the consumer's
	// real import chain, which starts at @poodle64/design-tokens' own emitted
	// `tokens.tw.css`. Filtering to `ui` leaves that unbuilt and the base build
	// dies on an unresolvable export rather than on anything meaningful.
	run('pnpm', ['run', 'build'], worktree);
	run('pnpm', ['--filter', '@poodle64/ui', 'run', 'harness:build'], worktree);

	console.log('building the working tree');
	run('pnpm', ['run', 'build'], repoRoot);
	run('pnpm', ['--filter', '@poodle64/ui', 'run', 'harness:build'], repoRoot);

	browser = await chromium.launch();
	const before = await capture(join(worktree, 'packages/ui/harness/dist'), browser);
	const after = await capture(join(packageRoot, 'harness/dist'), browser);

	let fields = 0;
	const differences = [];
	for (const key of Object.keys(before)) {
		if (!(key in after)) {
			differences.push(`${key} :: missing from the working-tree capture`);
			continue;
		}
		for (const field of Object.keys(before[key])) {
			fields += 1;
			const a = JSON.stringify(before[key][field]);
			const b = JSON.stringify(after[key][field]);
			if (a !== b) differences.push(`${key} :: ${field}\n  base: ${a}\n  now : ${b}`);
		}
	}

	console.log(
		`\n${Object.keys(before).length} surface/viewport pairs, ${fields} compared fields (including the screenshot hash), base ${baseRef}`
	);
	if (differences.length === 0) {
		console.log('IDENTICAL on every field and every pixel — the change is additive.');
	} else {
		console.error(`\n${differences.length} DIFFERENCE(S) — the change is NOT additive:\n`);
		for (const d of differences) console.error(`${d}\n`);
		process.exitCode = 1;
	}
} finally {
	await browser?.close();
	if (worktree) {
		run('git', ['worktree', 'remove', '--force', worktree], repoRoot);
		rmSync(worktree, { recursive: true, force: true });
	}
}
