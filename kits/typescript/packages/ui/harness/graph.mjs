/**
 * The real-browser gate for GraphCanvas (`?surface=graph`).
 *
 * Standalone beside `drive.mjs` (own port, own server) because the graph is a
 * canvas: jsdom has no 2D context, and every claim worth making about it is a
 * pixel or a pointer. What is asserted is listed in `harness/drive.md`.
 *
 *     node harness/graph.mjs            # after `pnpm run harness:build`
 *     GRAPH_SHOTS=<dir> node harness/graph.mjs   # also writes the screenshots
 *     CHROMIUM_PATH=/path/to/chrome ...          # where the bundled one will not run
 *
 * Checks 1-12 run in page mode and in shadow mode (the same component mounted
 * inside an open shadow root that adopts the compiled stylesheet, as an element
 * does). The pinch is page mode only. Smoothness is reported, never asserted.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'dist');
const PORT = Number(process.env.GRAPH_PORT ?? 4182);
const SETTLE_TIMEOUT = 240_000;
const SHOTS = process.env.GRAPH_SHOTS || '';

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.map': 'application/json'
};

if (!existsSync(join(root, 'index.html'))) {
	console.error('harness/dist is missing — run `pnpm run harness:build` first');
	process.exit(1);
}

const failures = [];
const checks = [];

/** Record a check. `detail` is what was actually observed, and is always shown. */
function check(name, ok, detail) {
	checks.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`);
	if (!ok) failures.push(`${name} — observed: ${detail}`);
}

/** Run one check body; a thrown error fails that check and the rest carry on. */
async function attempt(name, body) {
	try {
		await body();
	} catch (error) {
		check(name, false, `threw: ${String(error.message ?? error).split('\n')[0]}`);
	}
}

const server = createServer((request, response) => {
	const path = decodeURIComponent(request.url.split('?')[0]);
	let file = join(root, path);
	if (path === '/') file = join(root, 'index.html');
	if (!existsSync(file) || statSync(file).isDirectory()) {
		response.statusCode = 404;
		response.end('not found');
		return;
	}
	response.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
	response.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

/**
 * In-page helpers, installed before the page's own scripts. Everything that
 * reads pixels or geometry lives here so a check is one `evaluate` call.
 * Coordinates it returns are page px (canvas rect + the graph's own `locate`).
 */
const LIB = `
(() => {
const host = () => document.querySelector('[data-testid=graph-host]');
const scope = () => host()?.shadowRoot ?? document;
const gRoot = () => scope().querySelector('[data-slot=graph-canvas]');
const canvas = () => gRoot()?.querySelector('canvas');
const api = () => window.__graph.api;
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };

const ids = () => window.__graph.ids;

const pagePoint = (id) => {
	const p = api().locate(id);
	if (!p) return null;
	const r = canvas().getBoundingClientRect();
	return { x: r.x + p.x, y: r.y + p.y };
};

/** Chrome that sits over the canvas: the find panel, the controls and the card. */
const covers = () => {
	const g = gRoot();
	return [...g.children].filter((el) => el.tagName !== 'CANVAS' && el.tagName !== 'SPAN' && el.tagName !== 'P' && getComputedStyle(el).display !== 'none').map(rectOf);
};
const under = (pt, rects, margin = 0) => rects.some((r) => pt.x >= r.x - margin && pt.x <= r.x + r.w + margin && pt.y >= r.y - margin && pt.y <= r.y + r.h + margin);

const colourOf = (css) => {
	const probe = document.createElement('span');
	probe.style.color = css;
	gRoot().append(probe);
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	const c = document.createElement('canvas');
	c.width = c.height = 1;
	const x = c.getContext('2d', { willReadFrequently: true });
	x.fillStyle = resolved;
	x.fillRect(0, 0, 1, 1);
	const d = x.getImageData(0, 0, 1, 1).data;
	return [d[0], d[1], d[2]];
};

const count = (rgb, tol = 24) => {
	const c = canvas();
	const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
	let n = 0;
	for (let i = 0; i < d.length; i += 4) {
		if (d[i + 3] > 250 && Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2]) <= tol) n++;
	}
	return n;
};

const hash = () => {
	const c = canvas();
	const d = new Uint32Array(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.buffer);
	let h = 2166136261;
	for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
	return h >>> 0;
};

/** Nodes near the canvas centre, clear of the chrome and at least gap px from any other node. */
const isolated = (gap = 14, take = 6) => {
	const r = canvas().getBoundingClientRect();
	const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
	const cov = covers();
	const all = ids().map((id) => ({ id, ...pagePoint(id) })).filter((p) => Number.isFinite(p.x));
	const near = all
		.filter((p) => p.x > r.x + 20 && p.x < r.x + r.width - 20 && p.y > r.y + 20 && p.y < r.y + r.height - 20 && !under(p, cov, 16))
		.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
		.slice(0, 400);
	const out = [];
	for (const p of near) {
		let d = Infinity;
		for (const q of all) if (q.id !== p.id) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
		if (d >= gap) out.push({ id: p.id, x: p.x, y: p.y, gap: d });
		if (out.length >= take) break;
	}
	return out;
};

/** The point on the canvas furthest from every node and clear of the chrome. */
const emptySpot = () => {
	const r = canvas().getBoundingClientRect();
	const cov = covers();
	const pts = ids().map(pagePoint).filter(Boolean);
	let best = { x: r.x + r.width / 2, y: r.y + r.height / 2, d: -1 };
	for (let y = r.y + 30; y < r.y + r.height - 30; y += 20) {
		for (let x = r.x + 30; x < r.x + r.width - 30; x += 20) {
			if (under({ x, y }, cov, 20)) continue;
			let d = Infinity;
			for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
			if (d > best.d) best = { x, y, d };
		}
	}
	return best;
};

/** Resolves once the node has not moved for several frames (a tween or a layout has finished). */
const stable = (id = 'o0', frames = 6, cap = 20000) => new Promise((resolve) => {
	const t0 = performance.now();
	let last = null, same = 0;
	const tick = () => {
		const p = api()?.locate(id);
		const key = p ? p.x.toFixed(2) + ',' + p.y.toFixed(2) : 'none';
		same = key === last ? same + 1 : 0;
		last = key;
		if (same >= frames || performance.now() - t0 > cap) resolve(key);
		else requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
});

const dist = (a, b) => { const p = api().locate(a), q = api().locate(b); return Math.hypot(p.x - q.x, p.y - q.y); };

/** 60 pan steps, one per animation frame, as synthetic mouse pointer events; returns rAF intervals. */
const panRun = (spot, steps = 60) => new Promise((resolve) => {
	const c = canvas();
	const r = c.getBoundingClientRect();
	const sign = spot.x > r.x + r.width / 2 ? -1 : 1;
	const fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
	const stamps = [];
	let i = 0;
	fire('pointerdown', spot.x, spot.y);
	const tick = (t) => {
		stamps.push(t);
		if (i < steps) {
			i++;
			fire('pointermove', spot.x + sign * 3 * i, spot.y + sign * 1.5 * i);
			requestAnimationFrame(tick);
		} else {
			fire('pointerup', spot.x + sign * 3 * i, spot.y + sign * 1.5 * i);
			resolve(stamps.slice(1).map((s, k) => s - stamps[k]));
		}
	};
	requestAnimationFrame(tick);
});

/** A two-finger pinch spreading apart, as touch pointer events on the canvas. */
const pinch = (from = 30, to = 120, steps = 12) => new Promise((resolve) => {
	const c = canvas();
	const r = c.getBoundingClientRect();
	const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
	const fire = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
	fire('pointerdown', 1, cx - from, cy);
	fire('pointerdown', 2, cx + from, cy);
	let i = 0;
	const tick = () => {
		i++;
		const d = from + ((to - from) * i) / steps;
		fire('pointermove', 1, cx - d, cy);
		fire('pointermove', 2, cx + d, cy);
		if (i < steps) requestAnimationFrame(tick);
		else {
			fire('pointerup', 1, cx - d, cy);
			fire('pointerup', 2, cx + d, cy);
			resolve(true);
		}
	};
	requestAnimationFrame(tick);
});

window.__drv = { host, gRoot, canvas, ids, pagePoint, covers, under, rectOf, colourOf, count, hash, isolated, emptySpot, stable, dist, panRun, pinch };
})();
`;

/** A fresh context per page: a stylesheet cached across navigations is the trap recorded in drive.md. */
async function open(query, viewport, extra = {}) {
	const context = await browser.newContext({ viewport, colorScheme: 'light', ...extra });
	await context.addInitScript(LIB);
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text() + (m.location().url ?? ''))) errors.push(m.text());
	});
	const t0 = Date.now();
	await page.goto(`http://127.0.0.1:${PORT}/index.html?surface=graph${query}`, { waitUntil: 'load' });
	return { context, page, errors, t0 };
}

const graph = (page) => page.locator('[data-slot=graph-canvas]');
const settled = (page, timeout = SETTLE_TIMEOUT) => page.locator('[data-slot=graph-canvas][data-layout=settled]').waitFor({ state: 'attached', timeout });
const stable = (page, id) => page.evaluate((i) => window.__drv.stable(i), id ?? 'o0');
const dist = (page, a, b) => page.evaluate(([x, y]) => window.__drv.dist(x, y), [a, b]);
const point = (page, id) => page.evaluate((i) => window.__drv.pagePoint(i), id);
const setDark = (page, dark) => page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : String(n));

/** Close any card and frame the whole graph again, so each check starts from the same view. */
async function reset(page) {
	const close = page.getByRole('button', { name: 'Close', exact: true });
	if (await close.isVisible()) await close.click();
	await page.evaluate(() => window.__graph.api.fit());
	await stable(page);
}

async function suite(mode) {
	const shadow = mode === 'shadow';
	const tag = (name) => `${name} (${mode})`;
	const { context, page, errors, t0 } = await open(shadow ? '&shadow=1' : '', { width: 1440, height: 900 });
	try {
		// 1. Layout settles
		let ok = true;
		try {
			await settled(page);
		} catch {
			ok = false;
		}
		const seconds = ((Date.now() - t0) / 1000).toFixed(1);
		const counts = await page.evaluate(() => `${window.__graph.nodes} nodes, ${window.__graph.edges} edges`);
		check(tag('layout settles'), ok, `${ok ? 'settled' : 'NOT settled'} after ${seconds}s, ${counts}`);
		if (!ok) return;
		await page.evaluate(() => window.__graph.api.fit());
		await stable(page);

		// 2. The canvas paints the person kind
		let primary;
		let before = 0;
		await attempt(tag('canvas paints the person colour'), async () => {
			primary = await page.evaluate(() => window.__drv.colourOf('var(--ds-color-primary)'));
			before = await page.evaluate((c) => window.__drv.count(c), primary);
			check(tag('canvas paints the person colour'), before > 300, `rgb(${primary}) pixels: ${before}`);
		});

		// 3. Live re-theme
		await attempt(tag('live re-theme repaints'), async () => {
			await page.evaluate(() => document.documentElement.style.setProperty('--ds-color-primary', 'oklch(0.65 0.25 30)'));
			const t = Date.now();
			const next = await page.evaluate(() => window.__drv.colourOf('var(--ds-color-primary)'));
			let fresh = 0;
			let old = before;
			while (Date.now() - t < 4000) {
				[fresh, old] = await page.evaluate(([n, o]) => [window.__drv.count(n), window.__drv.count(o)], [next, primary]);
				if (fresh > 300 && old < before * 0.1) break;
			}
			const took = Date.now() - t;
			await page.evaluate(() => document.documentElement.style.removeProperty('--ds-color-primary'));
			check(
				tag('live re-theme repaints'),
				fresh > 300 && old < before * 0.1 && took <= 2500,
				`new rgb(${next}) ${fresh}px, old ${old}px of ${before}, after ${took}ms`
			);
			// Restore: the old colour must come back.
			let back = 0;
			for (let i = 0; i < 20 && back < before * 0.8; i++) back = await page.evaluate((c) => window.__drv.count(c), primary);
			check(tag('re-theme restores'), back >= before * 0.8, `old colour ${back}px of ${before}`);
		});

		// 4. Light / dark
		await attempt(tag('light/dark repaints'), async () => {
			const bg = () => graph(page).evaluate((el) => getComputedStyle(el).backgroundColor);
			const dark0 = await page.evaluate(() => document.documentElement.classList.contains('dark'));
			const bg0 = await bg();
			const h0 = await page.evaluate(() => window.__drv.hash());
			await setDark(page, !dark0);
			let h1 = h0;
			for (let i = 0; i < 40 && h1 === h0; i++) h1 = await page.evaluate(() => window.__drv.hash());
			const bg1 = await bg();
			check(tag('light/dark repaints'), bg0 !== bg1 && h0 !== h1, `dark ${dark0}→${!dark0}, background ${bg0} → ${bg1}, canvas hash ${h0} → ${h1}`);
			await setDark(page, dark0);
			let again = 0;
			for (let i = 0; i < 40 && again !== h0; i++) again = await page.evaluate(() => window.__drv.hash());
		});

		// 5. Click-select
		let o0label = '';
		await attempt(tag('click selects'), async () => {
			await reset(page);
			o0label = await page.evaluate(() => window.__graph.label('o0'));
			const p = await point(page, 'o0');
			await page.mouse.click(p.x, p.y);
			await page.waitForFunction(() => window.__graph.selected !== null, null, { timeout: 5000 }).catch(() => {});
			const attr = await graph(page).getAttribute('data-selected');
			const sel = await page.evaluate(() => window.__graph.selected);
			const card = graph(page).locator(`section[aria-label="${o0label}"]`);
			const visible = await card.isVisible();
			const heading = visible ? await card.getByRole('heading').first().textContent() : null;
			check(tag('click selects'), attr === 'o0' && sel === 'o0' && visible && heading?.trim() === o0label, `data-selected=${attr}, __graph.selected=${sel}, card visible=${visible}, heading=${JSON.stringify(heading?.trim())}, label=${JSON.stringify(o0label)}`);
		});

		// 6. Focus
		await attempt(tag('focus frames the neighbours'), async () => {
			if ((await page.evaluate(() => window.__graph.selected)) !== 'o0') {
				await reset(page);
				await page.evaluate(() => window.__graph.api.focus('o0'));
			} else {
				await page.getByRole('button', { name: 'Focus', exact: true }).click();
			}
			await stable(page);
			const r = await page.evaluate(() => {
				const d = window.__drv;
				const cr = d.canvas().getBoundingClientRect();
				const card = d.gRoot().querySelector('section');
				const panel = d.gRoot().querySelector('ul[aria-label=Kinds]')?.parentElement;
				const hidden = [card, panel].filter(Boolean).map(d.rectOf);
				const nb = window.__graph.neighbours('o0');
				const bad = [];
				for (const id of nb) {
					const p = d.pagePoint(id);
					if (!p || p.x < cr.x || p.x > cr.x + cr.width || p.y < cr.y || p.y > cr.y + cr.height) bad.push(id + ':outside');
					else if (d.under(p, hidden)) bad.push(id + ':covered');
				}
				return { total: nb.length, bad: bad.length, sample: bad.slice(0, 5), hidden: hidden.length };
			});
			check(tag('focus frames the neighbours'), r.total > 0 && r.bad === 0 && r.hidden === 2, `${r.total - r.bad}/${r.total} neighbours of o0 clear of canvas edge, card and find panel (${r.hidden} covers measured)${r.bad ? ' bad ' + r.sample.join(',') : ''}`);
		});

		// 7. Pan
		await attempt(tag('drag pans'), async () => {
			await reset(page);
			const spot = await page.evaluate(() => window.__drv.emptySpot());
			const a = await page.evaluate(() => window.__graph.api.locate('o0'));
			await page.mouse.move(spot.x, spot.y);
			await page.mouse.down();
			await page.mouse.move(spot.x + 120, spot.y + 80, { steps: 10 });
			await page.mouse.up();
			await stable(page);
			const b = await page.evaluate(() => window.__graph.api.locate('o0'));
			const dx = b.x - a.x, dy = b.y - a.y;
			check(tag('drag pans'), Math.abs(dx - 120) <= 2 && Math.abs(dy - 80) <= 2, `o0 moved (${fmt(dx)}, ${fmt(dy)}) for a (120, 80) drag from empty spot ${fmt(spot.x)},${fmt(spot.y)} (${fmt(spot.d)}px from any node)`);
		});

		// 8. Wheel zoom
		await attempt(tag('wheel zooms about the pointer'), async () => {
			await reset(page);
			const [n, b, c] = await page.evaluate(() => window.__drv.isolated(14, 3));
			const under0 = await page.evaluate((id) => window.__graph.api.locate(id), n.id);
			const d0 = await dist(page, b.id, c.id);
			await page.mouse.move(n.x, n.y);
			await page.mouse.wheel(0, -300);
			await stable(page, n.id);
			const under1 = await page.evaluate((id) => window.__graph.api.locate(id), n.id);
			const d1 = await dist(page, b.id, c.id);
			const drift = Math.hypot(under1.x - under0.x, under1.y - under0.y);
			check(tag('wheel zooms about the pointer'), drift <= 3 && d1 > d0, `${n.id} drifted ${fmt(drift)}px; ${b.id}-${c.id} distance ${fmt(d0)} → ${fmt(d1)}`);
		});

		// 9. Find
		await attempt(tag('find selects the match'), async () => {
			await reset(page);
			const label = await page.evaluate(() => window.__graph.label('o7'));
			const input = page.getByRole('searchbox').or(page.locator('input[type=search]')).first();
			await input.fill(label);
			const listed = await page.locator('ul[aria-label=Matches]').getByRole('button', { name: label }).first().isVisible();
			await input.press('Enter');
			await page.waitForFunction(() => window.__graph.selected !== null, null, { timeout: 5000 }).catch(() => {});
			const sel = await page.evaluate(() => window.__graph.selected);
			check(tag('find selects the match'), listed && sel === 'o7', `typed ${JSON.stringify(label)}, listed=${listed}, selected=${sel}`);
			await input.fill('');
		});

		// 10. Legend
		await attempt(tag('legend hides and restores a kind'), async () => {
			await reset(page);
			const warn = await page.evaluate(() => window.__drv.colourOf('var(--ds-color-status-warning)'));
			const base = await page.evaluate((c) => window.__drv.count(c), warn);
			const row = page.locator('ul[aria-label=Kinds]').getByRole('button', { name: /^Sources/ });
			await row.click();
			const pressed1 = await row.getAttribute('aria-pressed');
			let hid = base;
			for (let i = 0; i < 40 && hid > base * 0.1; i++) hid = await page.evaluate((c) => window.__drv.count(c), warn);
			check(tag('legend hides a kind'), pressed1 === 'false' && hid < base * 0.1, `aria-pressed=${pressed1}, rgb(${warn}) ${base} → ${hid}px (${fmt((100 * (base - hid)) / base)}% drop)`);
			await row.click();
			const pressed2 = await row.getAttribute('aria-pressed');
			let back = 0;
			for (let i = 0; i < 40 && back < base * 0.8; i++) back = await page.evaluate((c) => window.__drv.count(c), warn);
			check(tag('legend restores a kind'), pressed2 === 'true' && back >= base * 0.5, `aria-pressed=${pressed2}, ${hid} → ${back}px of original ${base} (${fmt((100 * back) / base)}%)`);
			await settled(page).catch(() => {});
		});

		// 11. Double-click activates
		await attempt(tag('double-click activates'), async () => {
			await reset(page);
			const [n] = await page.evaluate(() => window.__drv.isolated(14, 1));
			await page.mouse.dblclick(n.x, n.y);
			await page.waitForFunction((id) => window.__graph.activated === id, n.id, { timeout: 5000 }).catch(() => {});
			const act = await page.evaluate(() => window.__graph.activated);
			check(tag('double-click activates'), act === n.id, `double-clicked ${n.id}, __graph.activated=${act}`);
		});

		// 12. Keyboard
		await attempt(tag('keyboard zooms and Escape clears'), async () => {
			await reset(page);
			const [b, c] = await page.evaluate(() => window.__drv.isolated(14, 2));
			const d0 = await dist(page, b.id, c.id);
			await graph(page).locator('canvas').focus();
			await page.keyboard.press('+');
			await stable(page);
			const d1 = await dist(page, b.id, c.id);
			check(tag('keyboard + zooms in'), d1 > d0, `${b.id}-${c.id} distance ${fmt(d0)} → ${fmt(d1)}`);
			// The zoom moved everything: pick a node again from the new view.
			const [m] = await page.evaluate(() => window.__drv.isolated(14, 1));
			await page.mouse.click(m.x, m.y);
			await page.waitForFunction(() => window.__graph.selected !== null, null, { timeout: 5000 }).catch(() => {});
			const sel = await graph(page).getAttribute('data-selected');
			await page.keyboard.press('Escape');
			await page.waitForFunction(() => window.__graph.selected === null, null, { timeout: 3000 }).catch(() => {});
			const after = await graph(page).getAttribute('data-selected');
			const handle = await page.evaluate(() => window.__graph.selected);
			check(tag('Escape clears the selection'), sel === m.id && after === null && handle === null, `selected ${sel} → data-selected=${after}, __graph.selected=${handle}`);
		});

		check(tag('no page errors'), errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '0 errors');

		// 14. Smoothness (page mode only), report-only
		if (!shadow) {
			for (const [w, h] of [[1440, 900], [3840, 2160]]) {
				await attempt(`smoothness ${w}x${h}`, async () => {
					await page.setViewportSize({ width: w, height: h });
					await settled(page);
					await reset(page);
					const spot = await page.evaluate(() => window.__drv.emptySpot());
					const gaps = await page.evaluate((s) => window.__drv.panRun(s), spot);
					const sorted = [...gaps].sort((a, b) => a - b);
					const median = sorted[Math.floor(sorted.length / 2)];
					const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
					check(`smoothness ${w}x${h} (report only)`, gaps.length === 60, `${gaps.length} steps, median rAF ${fmt(median)}ms, p95 ${fmt(p95)}ms, max ${fmt(sorted.at(-1))}ms`);
				});
			}
			if (SHOTS) await shots(page);
		}
	} finally {
		await context.close();
	}
}

/** 13. Two-finger pinch on a phone-sized page with touch. */
async function touchSuite() {
	const { context, page, errors, t0 } = await open('', { width: 390, height: 844 }, { hasTouch: true });
	try {
		await settled(page);
		check('touch: layout settles (page, 390x844)', true, `settled after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
		await attempt('pinch zooms in', async () => {
			await reset(page);
			const [b, c] = await page.evaluate(() => window.__drv.isolated(4, 2));
			const d0 = await dist(page, b.id, c.id);
			await page.evaluate(() => window.__drv.pinch(30, 120, 12));
			await stable(page);
			const d1 = await dist(page, b.id, c.id);
			check('pinch zooms in (page, 390x844 touch)', d1 > d0 * 1.5, `${b.id}-${c.id} distance ${fmt(d0)} → ${fmt(d1)} (${fmt(d1 / d0)}x for a 60px → 240px spread)`);
		});
		check('touch: no page errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '0 errors');
	} finally {
		await context.close();
	}
}

/** Screenshots: settled plus 800ms (the last repaint and any chrome transition), then shot. */
async function shoot(page, name, { dark, size, focus }) {
	await page.setViewportSize({ width: size[0], height: size[1] });
	await setDark(page, dark);
	await settled(page);
	await reset(page);
	if (focus) {
		await page.evaluate((id) => window.__graph.api.focus(id), focus);
		await page.waitForTimeout(1200);
	}
	await page.waitForTimeout(800);
	const file = join(SHOTS, name);
	await page.screenshot({ path: file });
	console.log(`SHOT  ${file}`);
}

async function shots(page) {
	mkdirSync(SHOTS, { recursive: true });
	const sizes = [[390, 844], [1440, 900], [3840, 2160]];
	for (const size of sizes) {
		for (const dark of [false, true]) {
			await attempt(`screenshot ${size[0]} ${dark ? 'dark' : 'light'}`, () => shoot(page, `graph-${size[0]}-${dark ? 'dark' : 'light'}.png`, { dark, size }));
		}
	}
	await attempt('screenshot 1440 dark o3', () => shoot(page, 'graph-1440-dark-focus-o3.png', { dark: true, size: [1440, 900], focus: 'o3' }));
	await attempt('screenshot 390 light p1', () => shoot(page, 'graph-390-light-focus-p1.png', { dark: false, size: [390, 844], focus: 'p1' }));
}

async function shadowShot() {
	mkdirSync(SHOTS, { recursive: true });
	const { context, page } = await open('&shadow=1', { width: 3840, height: 2160 });
	try {
		await shoot(page, 'graph-3840-light-shadow.png', { dark: false, size: [3840, 2160] });
	} finally {
		await context.close();
	}
}

try {
	await suite('page');
	await suite('shadow');
	await attempt('pinch', touchSuite);
	if (SHOTS) await attempt('screenshot 3840 light shadow', shadowShot);
} finally {
	await browser.close();
	server.close();
}

console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
if (failures.length > 0) {
	console.error(`\n${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
	process.exit(1);
}
