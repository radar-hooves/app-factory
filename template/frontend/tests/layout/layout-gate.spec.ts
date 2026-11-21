/**
 * The layout gate. Renders each route under test (the app's whole navigation
 * only when nothing names them) at the owner's widths (./viewports.ts), signed
 * in as the E2E suite is, and has another lab's vision model judge each route's
 * pictures for craft: three samples, the majority verdict. A route that does not
 * ship, or breaks a measured rule, fails the run. `pnpm layout-gate`
 * (scripts/layout-gate.mjs) names the routes a change touches, `--all` is the
 * whole sweep, and a pass writes the record the change pipeline asks for.
 * Writes nothing to the app.
 *
 * Environment:
 * - LAYOUT_GATE_BASE_URL   (config) gate a server already running.
 * - LAYOUT_GATE_ROUTES     comma-separated paths to gate instead of crawling.
 * - LAYOUT_GATE_MAX_ROUTES crawl cap, default 30.
 * - LAYOUT_GATE_JUDGE      `off` renders, measures and reports with no model call.
 * - LITELLM_URL, LITELLM_VIRTUAL_KEY  the proxy and a key vended from the broker
 *   (`portcullis exec --vend LITELLM_VIRTUAL_KEY=<the app's gateway key> -- pnpm
 *   layout-gate`); both are required while the judge is on. The key is never
 *   printed or written.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { VIEWPORTS as ANSWER } from './viewports';

const OUT = 'test-results/layout-gate';
const VIEWPORTS = ANSWER.split(',').map((pair) => {
	const m = /^\s*(\d+)x(\d+)\s*$/.exec(pair);
	if (!m) throw new Error(`layout gate: layout_gate_viewports holds "${pair}", not WIDTHxHEIGHT`);
	return { width: Number(m[1]), height: Number(m[2]) };
});
const WIDEST = VIEWPORTS[0]!;

// openai/sol answered every measured run (docs/research/2026-11-21-design-judge.md in
// master-project); one sample is unstable on a good page, a majority of three is not,
// and more than three calls at once draw the gateway's 500s.
const MODEL = 'openai/sol';
const SAMPLES = 3;
const JUDGE_TIMEOUT_MS = 240_000;
const JUDGE_CONCURRENCY = 3;

interface Metrics {
	pageType: string | null;
	shell: boolean;
	barTitle: string;
	barTitleCut: boolean;
	mainOverflow: number;
	frameOverflow: number;
	docOverflowX: number;
	status: number;
	errorOverlay: boolean;
	landedOrigin: string;
}
interface Shot extends Metrics {
	width: number;
}
interface Finding {
	severity: 'major' | 'minor';
	criterion: string;
	width: number;
	where: string;
	what: string;
	fix: string;
}
interface Sample {
	verdict: 'ship' | 'fix' | 'error';
	call: string;
	summary: string;
	findings: Finding[];
}
interface RouteResult {
	path: string;
	landed: string;
	pageType: string | null;
	shots: Shot[];
	failures: string[];
	samples: Sample[];
	verdict: 'pass' | 'broken';
}

const screen = (width: number, i: number) =>
	width < 768 ? 'a phone' : i === 0 ? 'a desktop monitor (his main screen)' : 'a laptop';

// A reading page's measure is the type scale's, so its prose column never fills a wide screen.
const READING = `This is a reading page: one centred column sized for prose. Prose held at a readable measure, with bands beside it, is its design and never a width fault at any width; a table, grid or dashboard held in that column still is.

`;

function prompt(pageType: string | null): string {
	const images = VIEWPORTS.map(
		(vp, i) => `- Image ${i + 1}: ${vp.width} CSS px wide, ${screen(vp.width, i)}.`
	).join('\n');
	return `You are a senior product designer, the last eye before a web app screen ships. The owner's bar is "clean, elegant, befitting our estate": the craft of a well-made product such as Linear, GitHub or Home Assistant, never a template or a page that looks machine-made.

You see screenshots of ONE page, each at a width the owner uses, at native size:
${images}

${pageType === 'reading' ? READING : ''}Judge the picture's craft only, as he will meet it at each width. The words, the data, the features and the order of content are other checks'; never report them. For every fault: the width, where on the screen, what is wrong, and the fix in one line.

The criteria:
1. Legibility: every text stands off its background, and every table, card and panel separates from the page behind it, by a surface of its own or rules strong enough to hold it together.
2. Hierarchy: squint; the most important thing dominates, and each heading level is visibly different from the next and from body text.
3. Typography: one coherent type scale; measure; line breaks that keep a phrase together and strand no word.
4. Alignment and rhythm: shared edges and baselines; spacing from a scale.
5. Edges: nothing stranded outside the block it belongs to, such as a label or icon floating far beyond the edge of its content. A control aligned to the edge of the block it serves, such as a view switch above a full-width table, is not stranded.
6. Width: on a wide screen the content uses the width; never held in a column narrower than about two thirds of the screen with empty bands beside it. Space below the last content is not a fault.
7. AI tells: a card per item where a list would do; equal tiles of uneven content; an icon on every label; gradient text, glow, side-tab borders, nested cards, the purple AI palette; a flat page where every block has the same weight.
8. Craft: designed by someone who cares, or assembled from defaults.

Severity is "major" for these faults only, each as a reader sees it at a glance:
- text, a table, card or panel that blends into the background behind it;
- headings indistinguishable from each other or from body text;
- a heading whose line break splits a phrase or strands a word;
- an element stranded outside the block it belongs to;
- content held in a column narrower than about two thirds of a wide screen;
- content clipped, overlapping or cut off with no cue that more follows (a row of tabs or chips cut at the screen's edge is that cue; text cut inside its own control is minor);
- an AI tell from criterion 7 that dominates the page.
Everything else is "minor": worth fixing, never a reason to hold the page back.

Verdict "ship" when nothing is major; "fix" otherwise.`;
}

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['verdict', 'summary', 'findings'],
	properties: {
		verdict: { type: 'string', enum: ['ship', 'fix'] },
		summary: { type: 'string' },
		findings: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['severity', 'criterion', 'width', 'where', 'what', 'fix'],
				properties: {
					severity: { type: 'string', enum: ['major', 'minor'] },
					criterion: {
						type: 'string',
						enum: [
							'legibility',
							'hierarchy',
							'typography',
							'alignment',
							'edges',
							'width',
							'ai-tells',
							'craft'
						]
					},
					width: { type: 'integer' },
					where: { type: 'string' },
					what: { type: 'string' },
					fix: { type: 'string' }
				}
			}
		}
	}
};

const slug = (path: string) =>
	path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '_');
const shotPath = (path: string, width: number) => join(OUT, `${slug(path)}-${width}.png`);

function normalise(href: string, origin: string): string | null {
	try {
		const url = new URL(href, origin);
		return url.origin === origin ? url.pathname : null;
	} catch {
		return null;
	}
}

async function openAt(browser: Browser, baseURL: string, vp: { width: number; height: number }) {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: vp.width, height: vp.height },
		deviceScaleFactor: 1
	});
	return { context, page: await context.newPage() };
}

async function settle(page: Page): Promise<void> {
	// A fresh context leaves the pointer at (0,0), inside the rail: a collapsed
	// rail peeks open and covers its own toggle, and a capture shows the peek.
	const size = page.viewportSize();
	if (size) await page.mouse.move(size.width - 1, size.height - 1);
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
	// The factory's own busy signals: a ContentSkeleton and a LoadingState
	// carry aria-busy / data-slot, a Skeleton carries data-slot. Nothing is
	// captured while any of them is on screen, and not before the fonts load.
	await page
		.waitForFunction(
			() =>
				document.fonts.status === 'loaded' &&
				!Array.from(
					document.querySelectorAll(
						'[aria-busy="true"], [data-slot="skeleton"], [data-slot="content-skeleton"], [data-slot="loading-state"], [role="status"][aria-label="Loading…"]'
					)
				).some((el) => (el as HTMLElement).getClientRects().length > 0),
			undefined,
			{ timeout: 15_000 }
		)
		.catch(() => {});
	await page.waitForTimeout(750);
}

async function railLinks(page: Page, origin: string): Promise<string[]> {
	const hrefs = await page
		.locator('.ds-shell-rail a[href]')
		.evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''));
	return hrefs.map((h) => normalise(h, origin)).filter((p): p is string => p !== null);
}

async function discover(browser: Browser, baseURL: string, cap: number): Promise<string[]> {
	const origin = new URL(baseURL).origin;
	const { context, page } = await openAt(browser, baseURL, WIDEST);
	try {
		await page.goto('/');
		await settle(page);
		const settings = await page.goto('/settings');
		await settle(page);
		const hasSettings =
			(settings?.status() ?? 0) < 400 && (await page.locator('.ds-shell').count()) > 0;
		if ((await page.locator('.ds-shell-rail').count()) === 0) {
			await page.goto('/');
			await settle(page);
		}
		if ((await page.locator('.ds-shell-rail').count()) === 0) {
			throw new Error(
				'layout gate: no rail at / or /settings, so the gate never reached the signed-in app (is the dev identity taking?)'
			);
		}
		const collapsed = page.locator('[data-testid="ds-rail-collapse"][aria-pressed="true"]');
		if ((await collapsed.count()) > 0) {
			await collapsed.first().click();
			await page.waitForTimeout(300);
		}
		const seen = new Set<string>(hasSettings ? ['/', '/settings'] : ['/']);
		const queue: string[] = [...(await railLinks(page, origin))];
		while (queue.length && seen.size < cap) {
			const path = queue.shift()!;
			if (seen.has(path)) continue;
			seen.add(path);
			await page.goto(path);
			await settle(page);
			for (const child of await railLinks(page, origin)) {
				if (!seen.has(child) && !queue.includes(child)) queue.push(child);
			}
		}
		return [...seen].sort();
	} finally {
		await context.close();
	}
}

async function measure(page: Page, status: number): Promise<Metrics> {
	const landedOrigin = new URL(page.url()).origin;
	const metrics = await page.evaluate(() => {
		const main = document.querySelector('#ds-main');
		const pageEl = document.querySelector('.ds-page');
		const pageType = pageEl?.getAttribute('data-page') ?? null;
		const frameMain = pageEl?.querySelector('.ds-page-main') as HTMLElement | null;
		const root = document.documentElement;
		return {
			pageType,
			shell: document.querySelector('.ds-shell') !== null,
			barTitle:
				(
					document.querySelector('[data-testid="ds-shell-location"]') as HTMLElement | null
				)?.innerText.trim() ?? '',
			// The title may not end in an ellipsis: a cut name is a name nobody can read.
			barTitleCut: (() => {
				const title = document.querySelector(
					'[data-testid="ds-shell-title"]'
				) as HTMLElement | null;
				return title ? title.scrollWidth > title.clientWidth + 1 : false;
			})(),
			mainOverflow: main ? main.scrollHeight - main.clientHeight : 0,
			frameOverflow:
				frameMain && (pageType === 'tool' || pageType === 'panel')
					? frameMain.scrollHeight - frameMain.clientHeight
					: 0,
			// The shell's content region scrolls, so a wide child's excess shows there, not on the document.
			docOverflowX: Math.max(
				root.scrollWidth - root.clientWidth,
				main ? main.scrollWidth - main.clientWidth : 0
			),
			errorOverlay: document.querySelector('vite-error-overlay') !== null
		};
	});
	return { ...metrics, status, landedOrigin };
}

function deterministic(path: string, origin: string, shots: Shot[]): string[] {
	const out: string[] = [];
	for (const x of shots) {
		const at = `${x.width} px: `;
		if (x.landedOrigin !== origin) out.push(`${at}left the app for ${x.landedOrigin}`);
		// Home may stand outside the shell (a landing); every other route is a signed-in page.
		else if (!x.shell && path !== '/')
			out.push(`${at}no shell (not signed in, or the route left the app)`);
		if (x.status >= 400) out.push(`${at}server error (HTTP ${x.status})`);
		if (x.errorOverlay) out.push(`${at}dev error overlay showing`);
		if (x.shell && !x.barTitle) out.push(`${at}bar title missing`);
		if (x.barTitleCut) out.push(`${at}bar title is cut off`);
		if (x.shell && x.pageType === null) out.push(`${at}no page type frame`);
		if ((x.pageType === 'tool' || x.pageType === 'panel') && x.mainOverflow > 1) {
			out.push(`${at}page scrolls on a tool/panel page (by ${x.mainOverflow} px)`);
		}
		if (x.docOverflowX > 1) out.push(`${at}page scrolls sideways (by ${x.docOverflowX} px)`);
	}
	return out;
}

async function renderRoute(browser: Browser, baseURL: string, path: string): Promise<RouteResult> {
	const shots: Shot[] = [];
	let landed = path;
	for (const vp of VIEWPORTS) {
		const { context, page } = await openAt(browser, baseURL, vp);
		try {
			const response = await page.goto(path);
			await settle(page);
			landed = new URL(page.url()).pathname + new URL(page.url()).search;
			await page.screenshot({ path: shotPath(path, vp.width) });
			shots.push({ width: vp.width, ...(await measure(page, response?.status() ?? 0)) });
		} finally {
			await context.close();
		}
	}
	const failures = deterministic(path, new URL(baseURL).origin, shots);
	return {
		path,
		landed,
		pageType: shots[0]?.pageType ?? null,
		shots,
		failures,
		samples: [],
		verdict: failures.length ? 'broken' : 'pass'
	};
}

function parseSample(text: string, call: string): Sample {
	const body = text.replace(/```(?:json)?/gi, '');
	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error('no JSON object in reply');
	const parsed = JSON.parse(body.slice(start, end + 1)) as {
		verdict?: unknown;
		summary?: unknown;
		findings?: Partial<Record<keyof Finding, unknown>>[];
	};
	if (parsed.verdict !== 'ship' && parsed.verdict !== 'fix') throw new Error('no verdict field');
	return {
		verdict: parsed.verdict,
		call,
		summary: String(parsed.summary ?? ''),
		findings: (Array.isArray(parsed.findings) ? parsed.findings : []).map((f) => ({
			severity: f.severity === 'major' ? 'major' : 'minor',
			criterion: String(f.criterion ?? '?'),
			width: Number(f.width ?? 0),
			where: String(f.where ?? ''),
			what: String(f.what ?? ''),
			fix: String(f.fix ?? '')
		}))
	};
}

async function ask(result: RouteResult): Promise<Sample> {
	const images = VIEWPORTS.map((vp) => ({
		type: 'image_url',
		image_url: {
			url: `data:image/png;base64,${readFileSync(shotPath(result.path, vp.width)).toString('base64')}`
		}
	}));
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
	try {
		const res = await fetch(`${process.env.LITELLM_URL!.replace(/\/$/, '')}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.LITELLM_VIRTUAL_KEY}`
			},
			body: JSON.stringify({
				model: MODEL,
				// All of it is the user's message: openai/sol refuses a system message.
				messages: [
					{ role: 'user', content: [{ type: 'text', text: prompt(result.pageType) }, ...images] }
				],
				response_format: {
					type: 'json_schema',
					json_schema: { name: 'judgement', strict: true, schema: SCHEMA }
				}
			}),
			signal: controller.signal
		});
		if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
		const json = (await res.json()) as {
			id?: string;
			choices?: { message?: { content?: string } }[];
		};
		const call = res.headers.get('x-litellm-call-id') ?? json.id ?? '';
		return parseSample(String(json.choices?.[0]?.message?.content ?? ''), call);
	} catch (error) {
		throw new Error(controller.signal.aborted ? 'timed out' : (error as Error).message);
	} finally {
		clearTimeout(timer);
	}
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
	const queue = [...items];
	await Promise.all(
		Array.from({ length: Math.min(size, queue.length) }, async () => {
			while (queue.length) await run(queue.shift()!);
		})
	);
}

/** Three samples a measured-clean route; it ships on a majority of the three. */
async function judge(results: RouteResult[], write: () => void): Promise<void> {
	const clean = results.filter((r) => !r.failures.length);
	await pool(
		clean.flatMap((r) => Array.from({ length: SAMPLES }, () => r)),
		JUDGE_CONCURRENCY,
		async (r) => {
			try {
				r.samples.push(await ask(r));
			} catch (error) {
				r.samples.push({
					verdict: 'error',
					call: '',
					summary: `${MODEL} failed: ${(error as Error).message}`,
					findings: []
				});
			}
			write();
		}
	);
	for (const r of clean) {
		if (r.samples.filter((s) => s.verdict === 'ship').length * 2 <= SAMPLES) r.verdict = 'broken';
	}
}

function report(results: RouteResult[], judging: boolean): string {
	const broken = results.filter((r) => r.verdict === 'broken').length;
	const widths = VIEWPORTS.map((vp) => vp.width).join(', ');
	const by = judging ? `judged by ${MODEL}, ${SAMPLES} samples a route` : 'judge off';
	const summary = `${results.length} routes, ${broken} broken, at ${widths} px, ${by}`;
	const rank = (f: Finding) => (f.severity === 'major' ? 0 : 1);
	const lines: string[] = [];
	for (const r of results) {
		const tally = r.samples.length ? `  ${r.samples.map((s) => s.verdict).join(', ')}` : '';
		lines.push(
			`${r.verdict === 'pass' ? 'PASS' : 'BROKEN'}  ${r.path}  ${r.pageType ?? 'no page type'}${tally}`
		);
		for (const f of r.failures) lines.push(`- ${f}`);
		r.samples.forEach((s, i) => {
			lines.push(
				`  sample ${i + 1}: ${s.verdict}${s.call ? ` (call ${s.call})` : ''}. ${s.summary}`
			);
			for (const f of [...s.findings].sort((a, b) => rank(a) - rank(b))) {
				lines.push(
					`  - ${f.severity}, ${f.criterion}, ${f.width} px, ${f.where}: ${f.what} Fix: ${f.fix}`
				);
			}
		});
	}
	return `${lines.join('\n')}\n\n${summary}\n`;
}

test('layout gate', async ({ browser, baseURL }) => {
	const judging = (process.env.LAYOUT_GATE_JUDGE ?? 'on').toLowerCase() !== 'off';
	if (judging && (!process.env.LITELLM_URL || !process.env.LITELLM_VIRTUAL_KEY)) {
		throw new Error(
			'layout gate: the judge needs LITELLM_URL and LITELLM_VIRTUAL_KEY (a key vended from the household broker); set both, or LAYOUT_GATE_JUDGE=off for a dry run.'
		);
	}
	if (!baseURL) throw new Error('layout gate: no baseURL; set LAYOUT_GATE_BASE_URL.');
	mkdirSync(OUT, { recursive: true });

	const named = process.env.LAYOUT_GATE_ROUTES?.split(',')
		.map((p) => p.trim())
		.filter(Boolean);
	const cap = Number(process.env.LAYOUT_GATE_MAX_ROUTES ?? 30);
	const paths = named?.length ? named : await discover(browser, baseURL, cap);

	const results: RouteResult[] = [];
	const write = () => {
		results.sort((a, b) => a.path.localeCompare(b.path));
		const md = report(results, judging);
		const json = {
			judging,
			model: MODEL,
			viewports: VIEWPORTS.map((vp) => `${vp.width}x${vp.height}`),
			routes: results
		};
		writeFileSync(join(OUT, 'report.json'), JSON.stringify(json, null, 2));
		writeFileSync(join(OUT, 'report.md'), md);
		return md;
	};
	for (const path of paths) {
		results.push(await renderRoute(browser, baseURL, path));
		write();
	}
	if (judging) await judge(results, write);
	const md = write();
	console.log(`${md.trim().split('\n').pop()}\nreport: ${join(process.cwd(), OUT, 'report.md')}`);

	const broken = results.filter((r) => r.verdict === 'broken').map((r) => r.path);
	expect(broken, `broken routes: ${broken.join(', ')}`).toEqual([]);
});
