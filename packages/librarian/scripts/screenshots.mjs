/**
 * The screenshot grid: every state, three widths, both themes.
 *
 * Scripted rather than driven by hand because it is pre-known choreography —
 * eleven states x three widths x two themes is 66 shots, and a person taking
 * them by hand takes 66 slightly different ones
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
	'sources',
	'attachments',
	'narration',
	'not-held',
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

			// A fold photographs as an absence, so this shot is taken open: the
			// activity line, then the "Thought" row inside it, which is where
			// Milton's between-tool sentence now lives. The claim the shot cannot
			// make — that it is not ALSO sitting in the answer — is asserted first,
			// on the closed state, at every width and both themes.
			if (state === 'narration') {
				const said = "Let me also check if there's any provision for cashing out";
				const closed = await page.locator('[role="log"]').innerText();
				if (closed.includes(said)) {
					failures.push(`${state}-${width}-${theme}: narration rendered as answer prose`);
				}
				await page.getByRole('button', { name: /documents read/ }).click();
				await page.getByRole('button', { name: 'Thought' }).click();
				await page.getByText(said, { exact: false }).waitFor();
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

	// And the pane is actually resizable. The handle is absolutely positioned
	// inside it, so a pane that is `static` at `lg` silently hands the handle to
	// some other ancestor and the drag moves nothing at all.
	await page.click('sup[data-cite="1"]');
	const pane = page.locator('aside[aria-label="Source document"]');
	await pane.waitFor();
	const before = await pane.boundingBox();
	await page.mouse.move(before.x + 3, 400);
	await page.mouse.down();
	await page.mouse.move(before.x - 160, 400, { steps: 8 });
	await page.mouse.up();
	const after = await pane.boundingBox();
	if (Math.round(after.width) - Math.round(before.width) < 150) {
		failures.push(
			`the source pane did not resize (${Math.round(before.width)}px -> ${Math.round(after.width)}px)`
		);
	}
	await context.close();
}

// The scope statement folds once there is a conversation over it, and the line
// it folds to is still the way back in. A screenshot shows the folded line; only
// this shows that it reopens — and it is checked at 390, where a statement that
// would not fold costs a reader most of the first screen.
{
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/librarian?state=answer`, {
		waitUntil: 'domcontentloaded'
	});
	const toggle = page.getByRole('button', { name: /what milton answers from/i });
	await toggle.waitFor();
	if ((await toggle.getAttribute('aria-expanded')) !== 'false') {
		failures.push('the scope statement did not fold once the conversation had a turn');
	}
	await toggle.focus();
	await page.keyboard.press('Enter');
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		failures.push('the folded scope statement did not reopen from the keyboard');
	}
	await context.close();
}

// A follow-up chip asks its question and takes the row with it. Two claims in
// one gesture, and neither survives a screenshot.
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/librarian?state=answer`, {
		waitUntil: 'domcontentloaded'
	});
	const chip = page.getByRole('button', { name: 'Can I carry leave over when I post?' });
	await chip.waitFor();
	const before = await page.locator('article').count();
	await chip.click();
	await page.waitForFunction(
		(had) => document.querySelectorAll('article').length > had,
		before
	);
	if (await page.getByRole('button', { name: 'How is long service leave different?' }).count()) {
		failures.push('a used follow-up row was still offering its other questions');
	}
	await context.close();
}

await browser.close();
server.close();
console.log(`${taken} screenshots -> ${out}`);
if (failures.length) {
	for (const line of failures) console.error(`FAIL ${line}`);
	process.exit(1);
}
console.log('no clipping at any width; the source pane opens from the keyboard, resizes, and returns focus on close');
