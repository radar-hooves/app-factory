/**
 * The screenshot grid: every state, three widths, both themes.
 *
 * Scripted rather than driven by hand because it is pre-known choreography —
 * seven states x three widths x two themes is 42 shots, and a person taking
 * them by hand takes 42 slightly different ones
 * (`rules-library/core/verification.md` §"Scripts Drive, Models Judge"). The
 * model's time goes on looking at the batch afterwards.
 *
 *     pnpm --filter @poodle64/console run build
 *     node packages/librarian/scripts/screenshots.mjs
 *
 * Serves the console's own static build, so what is photographed is the
 * package's compiled `dist` inside a real consumer's Tailwind build — not a
 * source tree with a dev server's leniency over it.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../console/build');
const out = join(here, '../docs/screenshots');
const PORT = 4182;

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2'
};

const WIDTHS = [390, 768, 1440];
const THEMES = ['light', 'dark'];
const STATES = [
	'empty',
	'working',
	'streaming',
	'answer',
	'citations',
	'attachments',
	'error',
	'stopped'
];

if (!existsSync(root)) {
	console.error(`no console build at ${root} — run: pnpm --filter @poodle64/console run build`);
	process.exit(1);
}

const server = createServer((req, res) => {
	const path = (req.url ?? '/').split('?')[0];
	let file = join(root, path === '/' ? 'index.html' : path);
	if (!existsSync(file) || statSync(file).isDirectory()) {
		const indexed = join(file, 'index.html');
		file = existsSync(indexed) ? indexed : join(root, 'index.html');
	}
	res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
	res.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(PORT, resolve));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let taken = 0;
const failures = [];

for (const theme of THEMES) {
	for (const width of WIDTHS) {
		const context = await browser.newContext({
			viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 },
			deviceScaleFactor: 1,
			colorScheme: theme
		});
		// mode-watcher reads this before first paint, so the page never renders
		// in the wrong theme and no toggle click has to be photographed around.
		await context.addInitScript(
			(mode) => localStorage.setItem('mode-watcher-mode', mode),
			theme
		);
		const page = await context.newPage();

		for (const state of STATES) {
			// `citations` is the `answer` turn with the source pane opened, which
			// is a click rather than a state of its own.
			const query = state === 'citations' ? 'answer' : state;
			await page.goto(`http://localhost:${PORT}/librarian?state=${query}`, {
				waitUntil: 'domcontentloaded'
			});
			await page.waitForSelector('textarea');
			await page.evaluate(() => document.fonts.ready);

			// The long answer is photographed from the TOP: the question, the one
			// activity line, the lead paragraph and the table are the claims, and
			// follow-scroll has parked the view 900px past all four. Scrolling up
			// also raises the jump-to-latest pill, which is the point of it.
			if (state === 'answer') {
				await page.evaluate(() => {
					document.querySelector('[role="log"]')?.scrollTo({ top: 0 });
				});
			}

			if (state === 'citations') {
				await page.click('sup[data-cite="1"]');
				await page.waitForSelector('aside[aria-label="Source document"] h3');
			}

			// One frame of settle: the pane scrolls its cited section into view and
			// the composer measures its own height on mount.
			await page.waitForTimeout(250);
			await page.screenshot({ path: join(out, `${state}-${width}-${theme}.png`) });
			taken += 1;

			// Nothing clips at 390. A table or a code fence wider than the measure
			// must scroll INSIDE itself; the moment one widens the page instead,
			// every turn above it is off-screen to the right and the reader has no
			// idea. Asserted rather than eyeballed, on every shot.
			const overflow = await page.evaluate(() => {
				const doc = document.documentElement;
				const log = document.querySelector('[role="log"]');
				return {
					page: doc.scrollWidth - doc.clientWidth,
					log: log ? log.scrollWidth - log.clientWidth : 0
				};
			});
			if (overflow.page > 1 || overflow.log > 1) {
				failures.push(
					`${state}-${width}-${theme}: scrolls sideways (page +${overflow.page}px, transcript +${overflow.log}px)`
				);
			}
		}

		await context.close();
	}
}

// The source pane must close on Escape and its chips must be reachable by
// keyboard alone — the two claims a screenshot cannot make.
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/librarian?state=answer`, {
		waitUntil: 'domcontentloaded'
	});
	await page.waitForSelector('sup[data-cite="1"]');
	await page.focus('sup[data-cite="1"]');
	await page.keyboard.press('Enter');
	await page.waitForSelector('aside[aria-label="Source document"]');
	await page.keyboard.press('Escape');
	await page.waitForSelector('aside[aria-label="Source document"]', { state: 'detached' });
	const refocused = await page.evaluate(() => document.activeElement?.getAttribute('data-cite'));
	if (refocused !== '1') failures.push(`focus did not return to the chip on close (got ${refocused})`);
	await context.close();
}

await browser.close();
server.close();
console.log(`${taken} screenshots -> ${out}`);
if (failures.length) {
	for (const line of failures) console.error(`FAIL ${line}`);
	process.exit(1);
}
console.log('no clipping at any width; the source pane opens and closes from the keyboard');
