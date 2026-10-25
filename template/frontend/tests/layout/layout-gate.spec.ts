/**
 * The layout gate. Renders each route under test (the app's whole navigation
 * only when nothing names them) at two viewports, signed in as the E2E suite
 * is, and has a vision model judge each route's pair of screenshots. Any broken
 * page fails the run. `pnpm layout-gate` (scripts/layout-gate.mjs) names the
 * routes a change touches; `--all` is the whole sweep. Writes nothing to the app.
 *
 * Environment:
 * - LAYOUT_GATE_BASE_URL   (config) gate a server already running.
 * - LAYOUT_GATE_ROUTES     comma-separated paths to gate instead of crawling.
 * - LAYOUT_GATE_MAX_ROUTES crawl cap, default 30.
 * - LAYOUT_GATE_JUDGE      `off` renders, measures and reports with no model call.
 * - LITELLM_URL, LITELLM_VIRTUAL_KEY  the proxy and a key vended from the broker;
 *   both are required while the judge is on. The key is never printed or written.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

const OUT = 'test-results/layout-gate';
const VIEWPORTS = [
	{ name: 'desktop', width: 1673, height: 1679 },
	{ name: 'phone', width: 390, height: 844 }
] as const;
type ViewportName = (typeof VIEWPORTS)[number]['name'];

const PRIMARY_MODEL = 'google/pro';
const FALLBACK_MODEL = 'openai/sol';
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
interface Issue {
	rule: string;
	where: string;
	detail: string;
}
interface Verdict {
	verdict: 'pass' | 'broken';
	issues: Issue[];
}
interface RouteResult {
	path: string;
	landed: string;
	pageType: string | null;
	metrics: Record<ViewportName, Metrics>;
	failures: string[];
	judgedBy: string | null;
	fallbackReason: string | null;
	judgeError: string | null;
	verdict: 'pass' | 'broken';
	issues: Issue[];
}

const SYSTEM_PROMPT = `You are a senior product designer judging one page of a web app shell. You are strict. You are given a desktop screenshot (1673x1679) then a phone screenshot (390x844) of the same route, with its page type and DOM metrics.

Return ONLY JSON, no prose, no code fence:
{"verdict":"pass"|"broken","issues":[{"rule":"<rubric id>","where":"desktop"|"phone"|"both","detail":"<one sentence>"}]}

Mark "broken" only for a real defect a reader would notice, never for taste. A passing page has an empty issues list.

The page type is the layout the route chose, so judge the page against it:
- reading: one centred column sized for prose, and an optional aside beside it with the pair centred; below about 1056 px of content the aside follows the column. The page scrolls.
- panel: a second column flush against the left rail (a section list, past questions), the content beside it left-aligned to that column. On a phone the column is a sheet opened from the top bar.
- tool: the whole frame, the content filling the frame's height and scrolling inside itself; an optional aside at the frame's right edge.

Rubric:
- whole: composed as one whole: the page reads as one designed composition, not parts placed independently.
- void: no void or stranded element: no large empty region beside content that should use it, nothing marooned far from what it belongs to (e.g. an aside pinned to the far edge, a list floating away from the rail).
- float: nothing floats over content: no control or panel overlapping text or controls it does not belong to.
- tool-scroll: on a "tool" page the content fills the frame to its bottom edge and scrolls inside itself; the page itself does not scroll (the metrics give mainOverflow).
- right-edge: one right edge per text column: blocks of running text in one column end at one shared right edge, not each at its own width.
- thumb: phone thumb reach: at 390 px the page's primary actions are reachable (not stranded at the top corner only, tap targets about 44 px), nothing is cut off or needs sideways scrolling.
- bar-title: the top bar names the page: its own name, or "Section › Page" on desktop; on a phone one name alone. A bare page name with no section is correct. The name is whole, never cut with an ellipsis.`;

const slug = (path: string) =>
	path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '_');

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
	const { context, page } = await openAt(browser, baseURL, VIEWPORTS[0]);
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

function deterministic(path: string, origin: string, m: Record<ViewportName, Metrics>): string[] {
	const out: string[] = [];
	for (const vp of VIEWPORTS) {
		const x = m[vp.name];
		const at = `${vp.name}: `;
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
	const metrics = {} as Record<ViewportName, Metrics>;
	let landed = path;
	for (const vp of VIEWPORTS) {
		const { context, page } = await openAt(browser, baseURL, vp);
		try {
			const response = await page.goto(path);
			await settle(page);
			landed = new URL(page.url()).pathname + new URL(page.url()).search;
			await page.screenshot({ path: join(OUT, `${slug(path)}-${vp.width}.png`) });
			metrics[vp.name] = await measure(page, response?.status() ?? 0);
		} finally {
			await context.close();
		}
	}
	const failures = deterministic(path, new URL(baseURL).origin, metrics);
	return {
		path,
		landed,
		pageType: metrics.desktop.pageType,
		metrics,
		failures,
		judgedBy: null,
		fallbackReason: null,
		judgeError: null,
		verdict: failures.length ? 'broken' : 'pass',
		issues: []
	};
}

function parseVerdict(text: string): Verdict {
	const body = text.replace(/```(?:json)?/gi, '');
	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error('no JSON object in reply');
	const parsed = JSON.parse(body.slice(start, end + 1));
	if (parsed.verdict !== 'pass' && parsed.verdict !== 'broken') throw new Error('no verdict field');
	const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
	return {
		verdict: parsed.verdict,
		issues: issues.map((i: Partial<Issue>) => ({
			rule: String(i.rule ?? '?'),
			where: String(i.where ?? 'both'),
			detail: String(i.detail ?? '')
		}))
	};
}

async function ask(model: string, result: RouteResult): Promise<Verdict> {
	const image = (vp: number) => ({
		type: 'image_url',
		image_url: {
			url: `data:image/png;base64,${readFileSync(join(OUT, `${slug(result.path)}-${vp}.png`)).toString('base64')}`
		}
	});
	const facts = JSON.stringify(
		{ route: result.path, pageType: result.pageType, metrics: result.metrics },
		null,
		1
	);
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
				model,
				temperature: 0,
				max_tokens: 16000,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{
						role: 'user',
						content: [
							{ type: 'text', text: `Desktop screenshot first, phone second.\n${facts}` },
							image(VIEWPORTS[0].width),
							image(VIEWPORTS[1].width)
						]
					}
				]
			}),
			signal: controller.signal
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = await res.json();
		return parseVerdict(String(json?.choices?.[0]?.message?.content ?? ''));
	} catch (error) {
		throw new Error(controller.signal.aborted ? 'timed out' : (error as Error).message);
	} finally {
		clearTimeout(timer);
	}
}

async function judge(result: RouteResult): Promise<void> {
	let verdict: Verdict;
	try {
		verdict = await ask(PRIMARY_MODEL, result);
		result.judgedBy = PRIMARY_MODEL;
	} catch (primary) {
		result.fallbackReason = `${PRIMARY_MODEL} failed: ${(primary as Error).message}`;
		try {
			verdict = await ask(FALLBACK_MODEL, result);
			result.judgedBy = FALLBACK_MODEL;
		} catch (fallback) {
			result.judgeError = `${FALLBACK_MODEL} failed: ${(fallback as Error).message}`;
			result.verdict = 'broken';
			result.failures.push(`no judge verdict (${result.fallbackReason}; ${result.judgeError})`);
			return;
		}
	}
	result.issues = verdict.issues;
	if (verdict.verdict === 'broken') result.verdict = 'broken';
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
	const queue = [...items];
	await Promise.all(
		Array.from({ length: Math.min(size, queue.length) }, async () => {
			while (queue.length) await run(queue.shift()!);
		})
	);
}

function report(results: RouteResult[], judging: boolean): string {
	const broken = results.filter((r) => r.verdict === 'broken').length;
	const models = [...new Set(results.map((r) => r.judgedBy).filter(Boolean))];
	const fallbacks = results.filter((r) => r.fallbackReason);
	const by = !judging
		? 'judge off'
		: fallbacks.length
			? `judged by ${models.join(', ') || 'no model'} (fallback on ${fallbacks.length}: ${[...new Set(fallbacks.map((r) => r.fallbackReason))].join('; ')})`
			: `judged by ${models.join(', ')}`;
	const summary = `${results.length} routes, ${broken} broken, ${by}`;
	const lines: string[] = [];
	for (const r of results) {
		lines.push(
			`${r.verdict === 'pass' ? 'PASS' : 'BROKEN'}  ${r.path}  ${r.pageType ?? 'no page type'}  ${r.judgedBy ?? 'not judged'}`
		);
		for (const f of r.failures) lines.push(`- ${f}`);
		for (const i of r.issues) lines.push(`- [${i.rule}, ${i.where}] ${i.detail}`);
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
		writeFileSync(join(OUT, 'report.json'), JSON.stringify({ judging, routes: results }, null, 2));
		writeFileSync(join(OUT, 'report.md'), md);
		return md;
	};
	for (const path of paths) {
		results.push(await renderRoute(browser, baseURL, path));
		write();
	}
	if (judging)
		await pool(results, JUDGE_CONCURRENCY, async (result) => {
			await judge(result);
			write();
		});
	const md = write();
	console.log(`${md.trim().split('\n').pop()}\nreport: ${join(process.cwd(), OUT, 'report.md')}`);

	const broken = results.filter((r) => r.verdict === 'broken').map((r) => r.path);
	expect(broken, `broken routes: ${broken.join(', ')}`).toEqual([]);
});
