/**
 * The screenshot grid: every state, three widths, both themes.
 *
 * Scripted rather than driven by hand because it is pre-known choreography —
 * twenty-three states x three widths x two themes is 138 shots, and a person
 * taking them by hand takes 138 slightly different ones
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
	'stopped',
	'chat',
	'persona',
	'job',
	'job-showing',
	'job-live',
	'job-schema',
	'waiting',
	'answering',
	'mark',
	'fair-use',
	'limit',
	'past'
];

/** The measure the package guarantees in its OWN stylesheet: `--ds-lib-measure`,
 *  46rem. Tolerance is the scrollbar the column sits inside. */
const MEASURE_PX = 46 * 16;

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

// A host whose Playwright build cannot run its own download (NixOS) names a
// Chromium it can: `CHROMIUM=/nix/store/…-playwright-browsers/chromium-…/chrome-linux/chrome`.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
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
			// `chat` is photographed from the top for the same reason, and it is
			// the shot the whole redesign answers to: three turns, each bounded,
			// the reader's words against the persona's.
			// A job is photographed from the top too: the first run's answer, the
			// reading carded under it and what it read under that are the claims.
			if (state === 'answer' || state === 'chat' || state.startsWith('job')) {
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

			// The mark is taken with a verdict given, so the note's own line shows.
			if (state === 'mark') {
				await page.getByRole('button', { name: 'Helpful', exact: true }).click();
				await page.getByRole('textbox', { name: 'Anything to add? (optional)' }).waitFor();
			}

			// The live job is taken open: its rows are the host's words for tools
			// this package does not know, with the last call still in flight.
			if (state === 'job-live') {
				await page.getByRole('button', { name: 'Working…' }).click();
				await page.getByText('page 1, bottom slice').waitFor();
			}

			// The transcript is photographed at three widths and has to hold its
			// measure at all of them. This is the claim the package lost in a
			// consumer's production build — `max-w-[46rem]` compiled to nothing,
			// the column ran to 2302px — so it is asserted here, inside a real
			// consumer's build, rather than trusted to a class name.
			const column = await page.evaluate(() => {
				const log = document.querySelector('[role="log"]');
				const inner = log?.firstElementChild;
				if (!log || !inner) return null;
				const outer = log.getBoundingClientRect();
				const box = inner.getBoundingClientRect();
				return {
					width: box.width,
					left: box.left - outer.left,
					right: outer.right - box.right
				};
			});
			if (!column) {
				failures.push(`${state}-${width}-${theme}: no transcript column to measure`);
			} else {
				if (column.width > MEASURE_PX + 2) {
					failures.push(
						`${state}-${width}-${theme}: the column is ${Math.round(column.width)}px wide, past the ${MEASURE_PX}px measure`
					);
				}
				// Centred, not left-hugging: at 1440 with the pane closed the
				// column has ~350px of gutter either side and they must match.
				if (Math.abs(column.left - column.right) > 2) {
					failures.push(
						`${state}-${width}-${theme}: the column is not centred (${Math.round(column.left)}px / ${Math.round(column.right)}px)`
					);
				}
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

// A session the app started, read through the host's own surfaces. The
// package only hands over the taps: the artefact opens in the host's column,
// a page it read opens in the host's viewer, and neither opens a pane of the
// package's own. Asserted by what appears, never by a screenshot.
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/librarian?state=job`, { waitUntil: 'domcontentloaded' });
	const log = page.locator('[role="log"]');
	await page.getByRole('button', { name: '2 slices read · 1 sum checked' }).waitFor();

	const said = await log.innerText();
	const asked = ['File this document.', 'Which line is the largest', 'Look at the bottom slice again'];
	const at = asked.map((q) => said.indexOf(q));
	if (at.some((i) => i < 0) || at.some((i, n) => n > 0 && i < at[n - 1])) {
		failures.push(`job: the prompt and both messages are not on the reader's side in order (${at})`);
	}
	if (!said.includes('Receipt from Corner Grocer')) {
		failures.push('job: the first answer lost its prose to the artefact card');
	}

	const card = page.getByRole('button', { name: /What it read/ });
	if (!(await card.innerText()).includes('Open')) failures.push('job: the card offers no Open');
	await card.click();
	await page.locator('aside[aria-label="What it read"]').waitFor();
	if (!(await card.innerText()).includes('Showing')) {
		failures.push('job: the card does not say Showing while the host shows it');
	}
	if (await page.locator('aside[aria-label="Study artefact"]').count()) {
		failures.push('job: the package opened a pane of its own over the host');
	}

	await page.getByRole('button', { name: /Page 1 · top slice/ }).click();
	await page.locator('aside[aria-label="Page viewer"]', { hasText: 'Page 1 · top slice' }).waitFor();
	if (await page.locator('aside[aria-label="Source document"]').count()) {
		failures.push('job: a page it read opened the package source pane, not the host viewer');
	}
	if (await page.getByText(/verified/).count()) {
		failures.push('job: a page it read wears a trust mark nothing checked');
	}

	await page.goto(`http://localhost:${PORT}/librarian?state=job-live`, {
		waitUntil: 'domcontentloaded'
	});
	await page.getByRole('button', { name: 'Stop' }).waitFor();
	if (!(await page.getByText('It carries on from where it stopped.').count())) {
		failures.push('job-live: the composer lost its note');
	}
	if (await page.getByText('The whole library').count()) {
		failures.push('job-live: a surface with one scope offers a scope choice');
	}
	if (!(await page.getByRole('button', { name: 'Working…' }).count())) {
		failures.push('job-live: the run in flight does not read as working');
	}

	// A message said while the run works: the box is open, Send sits beside
	// Stop, and sending clears the box without stopping anything.
	const box = page.getByRole('textbox');
	if (await box.isDisabled()) failures.push('job-live: the box will not take a message mid-run');
	const articles = await page.locator('article').count();
	await box.fill('Skip the voided line.');
	await box.press('Enter');
	await page.waitForFunction((had) => document.querySelectorAll('article').length > had, articles);
	if ((await box.inputValue()) !== '') failures.push('job-live: a mid-run message was not sent');
	if (!(await page.getByRole('button', { name: 'Stop' }).count())) {
		failures.push('job-live: sending a message mid-run took Stop away');
	}
	await context.close();
}

// A session under a JSON schema: each run hands in its answer through the
// CLI's own StructuredOutput call. Both runs settle and card what they handed
// in, the second keeps its words, and the CLI's nudge to its own model shows
// on neither side. Over godswood's real recording.
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/librarian?state=job-schema`, {
		waitUntil: 'domcontentloaded'
	});
	await page.locator('article').nth(1).waitFor();
	const cards = await page.getByRole('button', { name: /What it read/ }).count();
	if (cards !== 2) failures.push(`job-schema: ${cards} of 2 runs carded what they handed in`);
	const said = await page.locator('[role="log"]').innerText();
	if (!said.includes('The three lines sum correctly')) {
		failures.push('job-schema: the words before the answer was handed in folded away');
	}
	if (said.includes('structured-output-enforce')) {
		failures.push("job-schema: the CLI's nudge to its own model is on screen");
	}
	if (said.includes('Looked into it')) {
		failures.push('job-schema: handing in the answer shows as a step of the work');
	}
	await context.close();
}

// The states a room adds, as words on screen: the question waiting its turn,
// an answer begun elsewhere and clocked from then, the allowance both ways,
// and the list newest first with the open one marked.
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const visit = (state) =>
		page.goto(`http://localhost:${PORT}/librarian?state=${state}`, { waitUntil: 'domcontentloaded' });

	await visit('waiting');
	await page.getByText('Milton is answering another question first…').waitFor();

	await visit('answering');
	await page.getByText('Milton is still answering…').waitFor();
	const clock = Number((await page.locator('article').last().getByText(/^\d+s$/).innerText()).slice(0, -1));
	if (clock < 95) failures.push(`answering: the clock reads ${clock}s, not from when the answer began`);

	await visit('fair-use');
	await page.getByText('12 of 40 questions left today. Resets at midnight.').waitFor();
	await visit('limit');
	const notice = page.getByRole('status').filter({ hasText: "today's fair-use limit of 40 questions" });
	await notice.waitFor();
	if (!(await notice.getByRole('link', { name: 'Support' }).count())) {
		failures.push('limit: the notice offers nowhere to ask about it');
	}

	await visit('past');
	const past = page.getByRole('region', { name: 'Past questions' });
	const titles = await past.getByRole('listitem').allInnerTexts();
	if (!titles[0]?.includes('Recreation leave each year') || titles.length !== 5) {
		failures.push(`past: not five conversations newest first (${titles.map((t) => t.trim()).join(' | ')})`);
	}
	const open = past.getByRole('button', { name: 'Recreation leave each year', exact: true });
	if ((await open.getAttribute('aria-current')) !== 'true') failures.push('past: the open conversation is not marked');
	await context.close();
}

// The package's own controller, driven over a fake of the rooms routes in a
// real engine: a question that waits, streams, counts against the allowance
// and takes a mark; one asked again and stopped; one reopened while its answer
// is still being written, which then settles; and a rename and a delete.
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(`http://localhost:${PORT}/librarian?state=room`, { waitUntil: 'domcontentloaded' });
	const list = page.getByRole('region', { name: 'Past questions' });
	await list.getByText('Recreation leave each year').waitFor();
	await page.getByText('40 of 40 questions left today.', { exact: false }).waitFor();

	await page.locator('textarea').fill('What is the total?');
	await page.locator('textarea').press('Enter');
	await page.getByText('Milton is answering another question first…').waitFor();
	await page.getByText('The total is $4.95.').first().waitFor({ timeout: 15_000 });
	await page.getByText('39 of 40 questions left today.', { exact: false }).waitFor();
	if (await page.getByText('Milton is answering another question first…').count()) {
		failures.push('room: still says it waits after the answer arrived');
	}

	await page.getByRole('button', { name: 'Helpful', exact: true }).click();
	const note = page.getByRole('textbox', { name: 'Anything to add? (optional)' });
	await note.fill('Exactly what I needed.');
	await note.press('Enter');
	await page.getByText('Thanks, noted.').waitFor();

	await page.getByRole('button', { name: 'Ask again' }).click();
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('button', { name: 'Send' }).waitFor();
	if ((await page.locator('article').count()) !== 2) failures.push('room: asking again made no second turn');
	if (await page.getByRole('button', { name: 'Stop' }).count()) failures.push('room: Stop outlived the answer it stopped');

	await list.getByRole('button', { name: 'Field allowance while deployed', exact: true }).click();
	await page.getByText('Milton is still answering…').waitFor();
	if (!(await page.getByText('And while I am in transit?').count())) {
		failures.push('room: a reopened answer in flight lost its question');
	}
	await page.getByText('Leave is administered under the one manual').waitFor({ timeout: 10_000 });
	if (await page.getByText('Milton is still answering…').count()) {
		failures.push('room: still answering after the answer settled');
	}

	await list.getByRole('button', { name: 'More: Field allowance while deployed' }).click();
	await list.getByRole('button', { name: 'Rename' }).click();
	const title = list.getByRole('textbox', { name: 'Rename' });
	await title.fill('Field allowance');
	await title.press('Enter');
	await list.getByRole('button', { name: /^Field allowance$/ }).waitFor();

	await list.getByRole('button', { name: 'More: Field allowance' }).click();
	await list.getByRole('button', { name: 'Delete' }).click();
	await list.getByRole('group', { name: 'Delete' }).getByRole('button', { name: 'Delete' }).click();
	await list.getByRole('button', { name: /^Field allowance$/ }).waitFor({ state: 'detached' });
	if (await page.locator('article').count()) failures.push('room: deleting the open conversation left it on screen');
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
console.log(
	'the column holds its measure and stays centred at every width; nothing clips; the source pane opens from the keyboard, resizes, and returns focus on close; a job opens its artefact and pages in the host; a room waits, streams, counts, takes a mark, stops, reopens mid-answer, renames and deletes'
);
