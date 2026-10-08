/**
 * The real-browser gate.
 *
 * `harness/drive.md` records the choreography a human (or an agent) drives by
 * hand; this is the subset a machine can run every time, unattended, in CI. It
 * exists because the three most expensive defects on this programme were all
 * invisible to every other check in the repo AND to jsdom, and were each found
 * by someone happening to look:
 *
 *   - overlay transitions that were dead because the variant matched nothing
 *     and, underneath that, because the animation utility did not exist;
 *   - a shell whose content region scrolled sideways on a phone while the
 *     document-level overflow check stayed green;
 *   - an avatar fallback that only a real failed request exercises.
 *
 * The compiled-CSS gates in `src/test/` prove a rule EXISTS and what selector
 * it carries. Only an engine proves the rule APPLIES to an element that has
 * actually opened, and only an engine has a layout to measure at all.
 *
 * Deterministic on purpose (rules-library/core/73-verification.md §"Scripts
 * Drive, Models Judge"): the choreography is scripted, so a pass is a machine
 * verdict rather than a screenshot someone eyeballed.
 *
 *     pnpm run test:browser        # harness:build + this
 */
import { chromium, webkit, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'dist');
const PORT = 4181;

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
	if (!ok) failures.push(`${name} — observed: ${detail}`);
}

const server = createServer((request, response) => {
	const path = decodeURIComponent(request.url.split('?')[0]);
	let file = join(root, path);
	// A 404 must not silently fall back to index.html: the avatar surface's whole
	// broken-image case depends on a request genuinely failing.
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

const browser = await chromium.launch();

/** A fresh context per surface: a stylesheet cached across navigations is the
 *  trap recorded in drive.md — the new JS runs against the old CSS. */
async function open(query, viewport = { width: 1440, height: 900 }, colorScheme = 'light') {
	const context = await browser.newContext({ viewport, colorScheme });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${PORT}/index.html?${query}`, { waitUntil: 'load' });
	return { context, page, errors };
}

// A second engine, launched only for the WebKit-specific gate below: WebKit's
// own table-layout/sticky quirks (and Mobile Safari's touch dispatch) are not
// something Chromium can stand in for.
const webkitBrowser = await webkit.launch();

/** Same contract as `open`, but on WebKit with a real phone's viewport, DPR
 *  and touch input — `device` defaults to `playwright.devices['iPhone 13']`. */
async function openWebkit(query, device = devices['iPhone 13']) {
	const context = await webkitBrowser.newContext({ ...device });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${PORT}/index.html?${query}`, { waitUntil: 'load' });
	return { context, page, errors };
}

// `.ds-nav-item` transitions `color` over 150ms, and a custom-property swap
// starts that transition. Reading `getComputedStyle` mid-flight returns the
// INTERPOLATED colour — serialised as oklab, and still most of the way back at
// the old hue — so the first run of the #11 gate measured the package default
// while believing it was measuring the override. Every measurement taken
// through this is of a settled resting state, so the transition is switched off
// rather than waited out. The palette gate below depends on it even harder: it
// swaps palettes on ONE page rather than reloading, so without this every
// reading after the first would be mid-flight between two palettes.
const SETTLE = '*, *::before, *::after { transition: none !important; animation: none !important; }';

/**
 * Everything a page needs to answer "what colour is actually painted here",
 * injected as a real script tag: `page.evaluate` cannot close over module
 * scope. Shared by the nav-ink gate (#11) and the palette catalogue gate (#25),
 * which ask the same question of different surfaces.
 */
const PROBE = `
(() => {
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 1;
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Composite a bottom-to-top stack of CSS colours and read the resulting
// opaque pixel. Letting the engine do it is the point: an oklch(), a
// color-mix() result and an rgba() all parse and blend exactly as they do on
// screen, so no colour-space or premultiplication assumption of ours can be
// wrong. The white base only shows through if every layer is transparent,
// which is the browser's own canvas default too.
const composite = (layers) => {
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, 1, 1);
	for (const layer of layers) {
		ctx.fillStyle = layer;
		ctx.fillRect(0, 0, 1, 1);
	}
	const d = ctx.getImageData(0, 0, 1, 1).data;
	return [d[0] / 255, d[1] / 255, d[2] / 255];
};

/** Every background between <html> and \`el\`, bottom first. */
const stack = (el, includeSelf) => {
	const layers = [];
	for (let n = includeSelf ? el : el.parentElement; n; n = n.parentElement) {
		layers.push(getComputedStyle(n).backgroundColor);
	}
	return layers.reverse();
};

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

/** Contrast of an element's ink against everything painted behind it. */
const inkRatio = (el, pseudo) => {
	if (!el) return null;
	const colour = getComputedStyle(el, pseudo ?? undefined).color;
	const behind = stack(el, true);
	return contrast(composite([...behind, colour]), composite(behind));
};

/** Contrast of an element's own fill against everything behind it. */
const fillRatio = (el, pseudo) => {
	if (!el) return null;
	const fill = getComputedStyle(el, pseudo ?? undefined).backgroundColor;
	const behind = stack(el, false);
	return contrast(composite([...behind, fill]), composite(behind));
};

window.__probe = { composite, stack, contrast, inkRatio, fillRatio };
})();
`;

// ── The overlay transitions (#6) ────────────────────────────────────────────
// A class-name assertion passes today while the transition is dead, and jsdom
// resolves no animation at all, so the claim is the RESOLVED animation-name on
// the element that opened.
{
	const OVERLAYS = [
		{ trigger: 'Open dialog', body: 'Dialogue body', slot: 'dialog-content', how: 'click' },
		{
			trigger: 'Open menu',
			body: 'Menu body',
			slot: 'dropdown-menu-content',
			how: 'click'
		},
		{ trigger: 'Open popover', body: 'Popover body', slot: 'popover-content', how: 'click' },
		{ trigger: 'Open select', body: 'Select body', slot: 'select-content', how: 'enter' }
	];

	for (const overlay of OVERLAYS) {
		const { context, page, errors } = await open('surface=overlays');
		const trigger = page.getByText(overlay.trigger, { exact: true });
		if (overlay.how === 'enter') {
			await trigger.focus();
			await page.keyboard.press('Enter');
		} else {
			await trigger.click();
		}

		let opened = true;
		try {
			await page
				.getByText(overlay.body, { exact: true })
				.first()
				.waitFor({ state: 'visible', timeout: 4000 });
		} catch {
			opened = false;
		}
		check(`${overlay.trigger}: the overlay opens`, opened, opened ? 'visible' : 'never appeared');

		const measured = await page.evaluate((slot) => {
			const el = document.querySelector(`[data-slot="${slot}"]`);
			if (!el) return null;
			const style = getComputedStyle(el);
			return {
				state: el.getAttribute('data-state'),
				animationName: style.animationName,
				animationDuration: style.animationDuration
			};
		}, overlay.slot);

		check(
			`${overlay.trigger}: bits-ui marks it data-state="open"`,
			measured?.state === 'open',
			JSON.stringify(measured)
		);
		// `none` is exactly what a dead variant OR a missing animation utility
		// produces, and it is what the whole class of defect looks like.
		check(
			`${overlay.trigger}: the enter animation resolves, not "none"`,
			measured?.animationName === 'enter',
			`animation-name: ${measured?.animationName}`
		);
		check(
			`${overlay.trigger}: it has a real duration`,
			measured !== null && parseFloat(measured.animationDuration) > 0,
			`animation-duration: ${measured?.animationDuration}`
		);
		check(`${overlay.trigger}: no page error`, errors.length === 0, JSON.stringify(errors));
		await context.close();
	}
}

// ── The shell's hidden sideways scroll (#5) ─────────────────────────────────
// The measurement every app already takes (documentElement.scrollWidth) is
// asserted here too, and shown to be blind: it passes in both cases while the
// content region genuinely overflows, which is why the region is measured
// directly.
{
	for (const width of [375, 320]) {
		for (const wrapper of ['plain', 'auto']) {
			for (const content of ['table', 'word']) {
				const { context, page } = await open(
					`surface=overflow&wrapper=${wrapper}&content=${content}`,
					{ width, height: 800 }
				);
				await page.waitForSelector('#ds-main');

				const measured = await page.evaluate(() => {
					const main = document.querySelector('#ds-main');
					const container = main.firstElementChild;
					const tableScroller = document.querySelector('[data-slot="table-container"]');
					return {
						mainScroll: main.scrollWidth,
						mainClient: main.clientWidth,
						containerClient: container.clientWidth,
						containerScroll: container.scrollWidth,
						documentScroll: document.documentElement.scrollWidth,
						innerWidth: window.innerWidth,
						tableScrolls: tableScroller.scrollWidth > tableScroller.clientWidth
					};
				});
				const where = `${width}px, ${wrapper} wrapper, ${content}`;

				// The claim the shell actually owns, and the one min-w-0 buys: its
				// content container is the content box, never its own min-content.
				// This is what fails without the fix — the container measured WIDER
				// than <main>, and every child then laid out against that wider box.
				check(
					`${where}: the content container is exactly the content box`,
					measured.containerClient === measured.mainClient,
					`container clientWidth ${measured.containerClient} vs main clientWidth ${measured.mainClient}`
				);

				if (content === 'table') {
					// The reported case. A wide child that carries its own scroller must
					// scroll inside it rather than widening the region around it.
					check(
						`${where}: the content region does not scroll sideways`,
						measured.mainScroll <= measured.mainClient,
						`main scrollWidth ${measured.mainScroll} vs clientWidth ${measured.mainClient} (+${measured.mainScroll - measured.mainClient}px)`
					);
					// Without this the fix could "pass" by clipping the table instead.
					check(
						`${where}: the wide table scrolls inside its own container`,
						measured.tableScrolls,
						`table container scrolls: ${measured.tableScrolls}`
					);
				}

				// Recorded, never asserted as sufficient: this is the measurement every
				// consuming app already takes, and it stays green through real overflow
				// because <main> is the scroll container. Printing it beside the real
				// numbers is the point.
				checks.push({
					name: `${where}: document-level check (the blind one)`,
					ok: true,
					detail: `documentElement.scrollWidth ${measured.documentScroll} vs innerWidth ${measured.innerWidth}; main overflow +${measured.mainScroll - measured.mainClient}px`
				});
				await context.close();
			}
		}
	}
}

// ── Overlays holding more rows than fit (#8) ────────────────────────────────
// `overflow-y-auto` only does something if a height constrains the box, and
// nothing in the class list says so out loud — the utility is present and inert.
// jsdom cannot see it: with no layout, scrollHeight and clientHeight are both 0,
// so `scrollHeight > clientHeight` is false on the fixed build and on the broken
// one alike. The claim has to be measured against a real box, which is why it is
// here and not in `src/test/`.
{
	// `scroller` is the element that genuinely scrolls, which is not always the
	// one carrying the cap. Select is the exception: bits-ui lays its content out
	// as a flex column and gives the viewport `flex: 1; overflow: auto`, so the
	// cap on the content is what gives the viewport a height to be `1` of, and
	// the viewport is what moves. Asserting `scrollHeight > clientHeight` on the
	// content there reads 740 vs 740 and calls a working select broken.
	const LONG = [
		{
			what: 'select',
			trigger: 'Open select',
			how: 'enter',
			slot: 'select-content',
			scroller: '[data-select-viewport]',
			// The pair only bits-ui can render, and only when the viewport can
			// actually scroll — which is the user-visible half of this defect.
			scrollButton: 'select-scroll-down-button'
		},
		{
			what: 'dropdown menu',
			trigger: 'Open menu',
			how: 'click',
			slot: 'dropdown-menu-content',
			scroller: '[data-slot="dropdown-menu-content"]'
		},
		{
			what: 'popover',
			trigger: 'Open popover',
			how: 'click',
			slot: 'popover-content',
			scroller: '[data-slot="popover-content"]'
		},
		{
			what: 'command list',
			trigger: 'Open command',
			how: 'click',
			slot: 'command-list',
			scroller: '[data-slot="command-list"]'
		}
	];

	// Two viewport heights, because one cannot tell a cap that tracks the space
	// available from a lucky constant. A static `max-h-96` passes at 800 and
	// fails at 560; the bits-ui variable passes at both.
	const HEIGHTS = [800, 560];

	for (const overlay of LONG) {
		for (const height of HEIGHTS) {
			// 1280x800 is the viewport the defect was reported at; 36 rows overflow
			// it by several hundred pixels, so nothing here turns on a pixel.
			const { context, page, errors } = await open('surface=long-lists', {
				width: 1280,
				height
			});
			const where = `${overlay.what} @ ${height}px`;
			const trigger = page.getByText(overlay.trigger, { exact: true });
			if (overlay.how === 'enter') {
				await trigger.focus();
				await page.keyboard.press('Enter');
			} else {
				await trigger.click();
			}
			await page.waitForSelector(`[data-slot="${overlay.slot}"]`, { timeout: 4000 });
			// The floating layer positions on a frame, so read after it has settled.
			await page.waitForTimeout(300);

			const measured = await page.evaluate(
				async ({ slot, scroller }) => {
					// The deepest element whose whole text is the last row.
					// Deliberately not a leaf test: a select item wraps its label
					// beside a check indicator, so nothing inside it is childless, and
					// a leaf test finds nothing and reports "unreachable" for entirely
					// the wrong reason.
					const findLastRow = () =>
						[...document.querySelectorAll('*')]
							.filter((node) => node.textContent.trim() === 'Option 36')
							.pop();

					const el = document.querySelector(`[data-slot="${slot}"]`);
					const scroll = document.querySelector(scroller);
					const rect = el.getBoundingClientRect();
					const opened = {
						contentRect: {
							top: Math.round(rect.top),
							height: Math.round(rect.height),
							bottom: Math.round(rect.bottom)
						},
						windowHeight: window.innerHeight,
						scrollHeight: scroll.scrollHeight,
						clientHeight: scroll.clientHeight,
						// Recorded whether or not it resolves: an unset custom property
						// and a consumed one look identical in the class list, and the
						// computed value is the only place the two differ.
						maxHeight: getComputedStyle(el).getPropertyValue('max-height'),
						rowRendered: findLastRow() !== undefined
					};
					// Reaching the last row is the outcome a mouse user needs, so drive
					// the scroll rather than inferring it from the numbers above.
					scroll.scrollTop = scroll.scrollHeight;
					await new Promise((resolve) => requestAnimationFrame(resolve));
					const lastRect = findLastRow()?.getBoundingClientRect();
					return {
						...opened,
						scrolledBy: Math.round(scroll.scrollTop),
						lastRow: lastRect
							? { top: Math.round(lastRect.top), bottom: Math.round(lastRect.bottom) }
							: null
					};
				},
				{ slot: overlay.slot, scroller: overlay.scroller }
			);

			// A row that was never rendered is neither reachable nor unreachable, and
			// would quietly turn the reachability claim below into a no-op.
			check(`${where}: the last of the 36 rows renders`, measured.rowRendered, 'Option 36');
			check(
				`${where}: the rows do not push it past the bottom of the window`,
				measured.contentRect.bottom <= measured.windowHeight,
				`content bottom ${measured.contentRect.bottom} vs window ${measured.windowHeight} (height ${measured.contentRect.height}, max-height ${measured.maxHeight})`
			);
			// Without this the cap could "pass" by clipping the rows instead of
			// scrolling them, which is the same defect wearing a different mask.
			check(
				`${where}: the rows past the fold scroll rather than being clipped`,
				measured.scrollHeight > measured.clientHeight,
				`scrollHeight ${measured.scrollHeight} vs clientHeight ${measured.clientHeight}`
			);
			check(
				`${where}: the last row can actually be reached`,
				measured.lastRow !== null &&
					measured.lastRow.top >= 0 &&
					measured.lastRow.bottom <= measured.windowHeight,
				`after scrolling ${measured.scrolledBy}px, last row at ${JSON.stringify(measured.lastRow)} in a ${measured.windowHeight}px window`
			);

			if (overlay.scrollButton) {
				// bits-ui renders these only while scrolling is possible, so their
				// absence is the user-facing half of the defect rather than a separate
				// one: a select that cannot scroll also shows nothing saying it could.
				const buttonShown = await page.evaluate(
					(slot) => document.querySelectorAll(`[data-slot="${slot}"]`).length,
					overlay.scrollButton
				);
				check(
					`${where}: the scroll affordance appears`,
					buttonShown > 0,
					`[data-slot="${overlay.scrollButton}"] count: ${buttonShown}`
				);
			}
			check(`${where}: no page error`, errors.length === 0, JSON.stringify(errors));
			await context.close();
		}
	}
}

// ── Nav ink against the chrome it is painted on (#11) ───────────────────────
// The defect class: a SHARED component painting a CONSUMER-supplied colour as
// ink. `--ds-color-primary` is validated across the estate as a FILL — the
// template's stated constraint is that it clear AA against its own
// `-foreground` pair — and the shell was additionally consuming it as text on
// its chrome, which is a stricter requirement no app was ever told about. Two
// real app palettes failed it (2.16:1 and 3.48:1 in light mode) while
// satisfying the documented one comfortably.
//
// Nothing but an engine can see this. jsdom applies no stylesheet and hands
// back the unresolved `var(--…)` literal, and the compiled-CSS gates prove a
// rule exists without ever resolving `color-mix()` over a real ancestor stack.
// So the claim is made here, from resolved computed colour, composited the way
// the compositor does it, in both themes.
{
	// Two genuinely different consumer palettes plus the package default. Both
	// fixtures satisfy the DOCUMENTED constraint (asserted below) — that is the
	// whole point: a palette can be entirely sanctioned and still be illegible
	// as ink, which is why the shell may not ask it to be ink.
	const PALETTES = [
		{ name: 'package default', light: null, dark: null },
		{
			// The failing shape: high-lightness warm hue. Barely moves against a
			// near-white chrome, and is unimpeachable as a fill.
			name: 'warm amber',
			light: { primary: 'oklch(0.75 0.11 75)', foreground: 'oklch(0.22 0.03 75)' },
			dark: { primary: 'oklch(0.80 0.10 75)', foreground: 'oklch(0.20 0.03 75)' }
		},
		{
			name: 'saturated blue',
			light: { primary: 'oklch(0.62 0.18 250)', foreground: 'oklch(0.20 0.03 250)' },
			dark: { primary: 'oklch(0.72 0.16 250)', foreground: 'oklch(0.20 0.03 250)' }
		}
	];

	/** The override a consuming app writes: the sanctioned surface, nothing else. */
	function paletteCss(palette) {
		if (!palette.light) return SETTLE;
		return [
			SETTLE,
			`:root { --ds-color-primary: ${palette.light.primary};`,
			`        --ds-color-primary-foreground: ${palette.light.foreground}; }`,
			`.dark { --ds-color-primary: ${palette.dark.primary};`,
			`        --ds-color-primary-foreground: ${palette.dark.foreground}; }`
		].join('\n');
	}

	for (const palette of PALETTES) {
		const css = paletteCss(palette);
		for (const mode of ['light', 'dark']) {
			const { context, page, errors } = await open(
				'surface=shell',
				{ width: 1440, height: 900 },
				mode
			);
			await page.addStyleTag({ content: css });
			await page.addScriptTag({ content: PROBE });
			await page.waitForSelector('.ds-nav-item[data-active="true"]');
			// Which theme is on screen is the load-bearing fact of this whole
			// section, so it is waited on and never assumed.
			await page.waitForFunction(
				(want) => document.documentElement.classList.contains('dark') === (want === 'dark'),
				mode
			);

			const measured = await page.evaluate(() => {
				const { inkRatio, fillRatio, composite, contrast } = window.__probe;

				const active = document.querySelector('.ds-nav-item[data-active="true"]');
				const resting = document.querySelector('.ds-nav-item:not([data-active])');
				const badge = active.querySelector('.ds-nav-badge');
				// The rail marks the active row with a flush edge bar.
				const indicator = active.querySelector('.ds-nav-indicator');

				const style = (el, pseudo) => getComputedStyle(el, pseudo ?? undefined);
				return {
					activeInk: inkRatio(active),
					restingInk: inkRatio(resting),
					badgeInk: badge ? inkRatio(badge) : null,
					indicator: fillRatio(indicator),
					// The redundancy that licenses not holding the indicator to
					// 1.4.11's 3:1 — asserted, never assumed.
					ariaCurrent: active.getAttribute('aria-current'),
					activeWeight: style(active).fontWeight,
					restingWeight: style(resting).fontWeight,
					activeColour: style(active).color,
					restingColour: style(resting).color,
					// The documented constraint the palette DOES carry, proved
					// against the built package rather than asserted in prose.
					fillPair: (() => {
						const probeEl = document.createElement('span');
						probeEl.style.background = 'var(--primary)';
						probeEl.style.color = 'var(--primary-foreground)';
						document.body.appendChild(probeEl);
						const s = getComputedStyle(probeEl);
						const ratio = contrast(
							composite([s.backgroundColor, s.color]),
							composite([s.backgroundColor])
						);
						probeEl.remove();
						return ratio;
					})()
				};
			});

			const where = `${palette.name}/${mode}`;

			// The palette is sanctioned. If this ever fails the fixture is wrong,
			// not the shell — and the whole argument below collapses without it.
			check(
				`${where}: the fixture palette clears AA as a fill, as the template requires`,
				measured.fillPair >= 4.5,
				`primary under primary-foreground: ${measured.fillPair}:1`
			);

			// The headline claim of #11.
			check(
				`${where}: the ACTIVE nav label clears AA on the chrome it sits on`,
				measured.activeInk >= 4.5,
				`${measured.activeInk}:1 (needs 4.5)`
			);
			// Asserted since #13 moved the token (was recorded-only: the resting
			// label is painted in `--ds-color-muted-foreground`, which was below
			// the text floor on every light surface the token package defines —
			// identical under all three palettes here because no consumer colour
			// is involved at all, unlike #11's active-label case above). #13
			// corrected the token package's own value; this is what pins it so it
			// cannot drift back.
			check(
				`${where}: resting nav label clears AA`,
				measured.restingInk >= 4.5,
				`${measured.restingInk}:1 against a 4.5 floor`
			);
			if (measured.badgeInk !== null) {
				// A count badge is text on a tint, so it carries the text floor too —
				// and it sits on the active row's tint as well as its own.
				check(
					`${where}: the nav badge count clears AA on its tint`,
					measured.badgeInk >= 4.5,
					`${measured.badgeInk}:1 (needs 4.5)`
				);
			}

			// WCAG 1.4.11 binds a state indicator at 3:1 only when the state is not
			// available another way. Here it is, three times over — so the bar is
			// free to carry the app's brand hue at full strength, and what gets
			// asserted is the redundancy that earns it that freedom.
			check(
				`${where}: the active state does not rest on the indicator alone`,
				measured.ariaCurrent === 'page' &&
					Number(measured.activeWeight) > Number(measured.restingWeight) &&
					measured.activeColour !== measured.restingColour,
				`aria-current=${measured.ariaCurrent}, weight ${measured.restingWeight}->${measured.activeWeight}, ink ${measured.restingColour} vs ${measured.activeColour}`
			);
			checks.push({
				name: `${where}: brand indicator against the chrome (recorded, not gated)`,
				ok: true,
				detail: `${measured.indicator}:1 — non-text, and redundant per the check above`
			});

			check(`${where}: no page error`, errors.length === 0, JSON.stringify(errors));
			await context.close();
		}
	}

	// The chrome-ink override has to actually reach the nav, or the shell's one
	// documented escape hatch for an inverted chrome is a dead affordance — the
	// exact trap `theme-coverage.test.ts` calls "worse than a missing key".
	// A compiled-CSS gate cannot see this: both declarations exist and are
	// correct in isolation; what decides it is which element the winning
	// declaration sits on, which is a cascade fact only an engine resolves.
	{
		// `pagenav=1` puts a SECOND AppNav in the page body, outside the chrome,
		// because the rule under test has to give two opposite answers at once: the
		// rail follows the chrome's ink, and a nav on the page must NOT be dragged
		// along with it. Only asserting the loud half would let the quiet half break
		// silently — which is the shape of every defect this harness exists for.
		const { context, page } = await open('surface=shell&pagenav=1');
		await page.addStyleTag({
			content: `${SETTLE}\n:root { --ds-shell-chrome: oklch(0.30 0.03 260); --ds-shell-chrome-foreground: oklch(0.97 0.01 260); --ds-shell-chrome-muted-foreground: oklch(0.80 0.02 260); }`
		});
		await page.addScriptTag({ content: PROBE });
		await page.waitForSelector('.ds-nav-item[data-active="true"]');
		await page.waitForSelector('nav[aria-label="Section"]');
		const measured = await page.evaluate(() => {
			const { inkRatio, composite } = window.__probe;
			// Both sides have to be normalised before they can be compared. A custom
			// property and a `color` resolve to the SAME colour and serialise
			// differently — `oklch(60% .012 85)` against `oklch(0.6 0.012 85)` — so a
			// string compare of the two is a tautology that would pass on the broken
			// build too. Painting each into the canvas and reading the pixel back
			// makes the engine answer "is this the same colour", which is the actual
			// question.
			const rgb = (value) => `rgb(${composite([value]).map((c) => Math.round(c * 255)).join(' ')})`;
			const page = getComputedStyle(document.body);
			const rail = document.querySelector('.ds-shell-rail');
			const secondary = document.querySelector('nav[aria-label="Section"]');
			const read = (scope, selector) => {
				const el = scope.querySelector(selector);
				return { rgb: rgb(getComputedStyle(el).color), ratio: inkRatio(el) };
			};
			return {
				railResting: read(rail, '.ds-nav-item:not([data-active])'),
				railActive: read(rail, '.ds-nav-item[data-active="true"]'),
				secondaryResting: read(secondary, '.ds-nav-item:not([data-active])'),
				secondaryActive: read(secondary, '.ds-nav-item[data-active="true"]'),
				// What the nav WOULD have painted had it kept reading the page's own
				// ink: the value the broken cascade was stuck on, and, for the
				// secondary column, the value it is still supposed to be on.
				pageMuted: rgb(page.getPropertyValue('--muted-foreground')),
				pageInk: rgb(page.getPropertyValue('--foreground'))
			};
		});
		// Two claims, and both are needed. The ratios prove the ink is legible on
		// the inverted chrome; the inequality proves it got there by FOLLOWING the
		// override rather than by the page's ink happening to suit — which is
		// exactly how this stayed invisible while the two defaulted to the same
		// token.
		check(
			'inverted chrome: the nav ink follows --ds-shell-chrome-foreground',
			measured.railResting.rgb !== measured.pageMuted &&
				measured.railActive.rgb !== measured.pageInk &&
				measured.railResting.ratio >= 4.5 &&
				measured.railActive.ratio >= 4.5,
			`resting ${measured.railResting.rgb} at ${measured.railResting.ratio}:1, active ${measured.railActive.rgb} at ${measured.railActive.ratio}:1 (the page's own ink is ${measured.pageMuted} / ${measured.pageInk}, which is what the broken cascade was stuck on)`
		);
		// The other half of the same rule, and the half that would go quiet: a
		// route-scoped column sits on the page background, so dragging it along
		// with the chrome would paint near-white ink on a near-white surface. One
		// rule has to give both answers, so both are asserted.
		check(
			'inverted chrome: a secondary nav outside it keeps the PAGE ink',
			measured.secondaryResting.rgb === measured.pageMuted &&
				measured.secondaryActive.rgb === measured.pageInk &&
				measured.secondaryActive.ratio >= 4.5,
			`resting ${measured.secondaryResting.rgb} at ${measured.secondaryResting.ratio}:1, active ${measured.secondaryActive.rgb} at ${measured.secondaryActive.ratio}:1 (page ink ${measured.pageMuted} / ${measured.pageInk}; the chrome's is ${measured.railActive.rgb})`
		);
		await context.close();
	}
}

// ── The palette catalogue (#25) ─────────────────────────────────────────────
// The master project's standalone shadcn showcase advertised "WCAG AA
// compliance indicators" for its twenty palettes and never gated one of them.
// Thirteen of its twenty accent pairs were below the 4.5:1 fill floor when they
// were lifted into this package — papyrus-gold at 2.20:1, nile-teal 2.63:1,
// scribes-amber 2.71:1, each pairing a light accent with a near-white
// foreground — and zinc's `destructive-foreground` was byte-identical to its
// `destructive`, a 1:1 label on a button. All of it rendered perfectly happily
// for five months, because rendering was the only thing anyone checked.
//
// `test/palettes.test.js` in the token package now holds the arithmetic floor,
// computed from the built stylesheet. This is the half it cannot reach: the
// same colours COMPOSITED over the real ancestor stack, which for the nav is
// three layers deep (a 12% tint over `bg-shell/80` over the page) and for a
// card is the palette's own surface over its own ground. A palette can satisfy
// the arithmetic against a flat surface and still be illegible on the surface a
// component actually paints it on — that is precisely what #11 was.
{
	// One page per theme, palettes swapped on it by attribute. A fresh context
	// per palette would be 40 loads for no gain: the whole claim is that a
	// palette IS an attribute swap and nothing more, so driving it as one is
	// closer to the thing under test, not a shortcut around it. SETTLE is what
	// makes it sound — without it every reading after the first would be caught
	// mid-transition between two palettes.
	// Resolved through the package's own exports map rather than by guessing a
	// node_modules path: the catalogue this gate measures has to be the one a
	// consumer would get, and a hand-built path would keep working after the
	// export was renamed or dropped.
	const catalogue = JSON.parse(
		readFileSync(createRequire(import.meta.url).resolve('@poodle64/design-tokens/palettes.json'), 'utf8')
	).palettes;
	const names = Object.keys(catalogue);
	check('palette catalogue: the harness sees every catalogued palette', names.length === 20, `${names.length} palettes`);

	const STATUS_SWATCHES = [
		'status-success',
		'status-warning',
		'status-error',
		'status-info',
		'status-neutral'
	];

	/** Read every claim this gate makes, at whatever palette is currently set. */
	const READ = () => {
		const { inkRatio, composite, contrast } = window.__probe;
		const q = (sel) => document.querySelector(sel);
		const swatches = Object.fromEntries(
			[...document.querySelectorAll('[data-swatch]')].map((el) => [
				el.dataset.swatch,
				getComputedStyle(el).backgroundColor
			])
		);

		const active = q('.ds-nav-item[data-active="true"]');
		const resting = q('.ds-nav-item:not([data-active])');
		const badge = active?.querySelector('.ds-nav-badge');
		const primaryButton = q('[data-probe="button-default-default"]');

		return {
			swatches,
			// Ink on the ordinary page ground and on a card, which are the two
			// surfaces a palette moves that an app's own copy actually sits on.
			bodyInk: inkRatio(q('[data-probe="card-body"]')),
			mutedInk: inkRatio(q('[data-probe="card-nested"] p')),
			pageMutedInk: inkRatio(q('[data-probe="palette-strategy"]')),
			// #11's claim, now under every catalogued palette rather than three
			// hand-written fixtures.
			activeNavInk: inkRatio(active),
			restingNavInk: inkRatio(resting),
			badgeInk: badge ? inkRatio(badge) : null,
			// The documented fill constraint, measured on a REAL Button rather
			// than a synthetic probe span: the claim is about the artefact a
			// consumer installs, and only the component knows which utilities it
			// actually resolves.
			buttonInk: inkRatio(primaryButton),
			buttonFill: primaryButton ? getComputedStyle(primaryButton).backgroundColor : null,
			// The pair as the template states it, so a failure can be told apart
			// from a failure of the surface the button happens to sit on.
			fillPair: (() => {
				const probeEl = document.createElement('span');
				probeEl.style.background = 'var(--primary)';
				probeEl.style.color = 'var(--primary-foreground)';
				document.body.appendChild(probeEl);
				const s = getComputedStyle(probeEl);
				const ratio = contrast(
					composite([s.backgroundColor, s.color]),
					composite([s.backgroundColor])
				);
				probeEl.remove();
				return ratio;
			})()
		};
	};

	for (const mode of ['light', 'dark']) {
		const { context, page, errors } = await open(
			'surface=palette',
			{ width: 1440, height: 900 },
			mode
		);
		await page.addStyleTag({ content: SETTLE });
		await page.addScriptTag({ content: PROBE });
		await page.waitForSelector('.ds-nav-item[data-active="true"]');
		// Which theme is on screen decides which half of every palette block
		// applies, so it is waited on and never assumed.
		await page.waitForFunction(
			(want) => document.documentElement.classList.contains('dark') === (want === 'dark'),
			mode
		);

		// The baseline: no palette attribute at all. Everything below is measured
		// as a MOVE from this, so "the palette applied" is a real observation
		// rather than a value that happens to look plausible.
		const base = await page.evaluate(READ);

		for (const name of names) {
			await page.evaluate((n) => {
				document.documentElement.dataset.dsPalette = n;
			}, name);
			const m = await page.evaluate(READ);
			const where = `${name}/${mode}`;
			const declared = catalogue[name].accent[mode];

			// Applied at all. A palette whose block never won the cascade would
			// otherwise pass every contrast check below on the package's own
			// colours — the silent half-application the `:root[data-…]` anchor
			// exists to prevent, seen from the other end.
			check(
				`${where}: the palette actually reaches the page`,
				m.swatches.primary !== base.swatches.primary ||
					m.swatches.background !== base.swatches.background,
				`primary ${base.swatches.primary} -> ${m.swatches.primary}, background ${base.swatches.background} -> ${m.swatches.background}`
			);

			// The status vocabulary is invariant. Asserted from RESOLVED colour
			// rather than from the emitter's output, because an app-level
			// `@theme` collision could move a status colour without any palette
			// declaring one.
			const movedStatus = STATUS_SWATCHES.filter((s) => m.swatches[s] !== base.swatches[s]);
			check(
				`${where}: the status vocabulary is untouched`,
				movedStatus.length === 0,
				movedStatus.length ? `moved: ${movedStatus.join(', ')}` : 'all five identical to the default'
			);

			check(
				`${where}: body copy on a card clears AA`,
				m.bodyInk >= 4.5,
				`${m.bodyInk}:1 (needs 4.5)`
			);
			check(
				`${where}: muted copy in a nested well clears AA`,
				m.mutedInk >= 4.5,
				`${m.mutedInk}:1 (needs 4.5)`
			);
			check(
				`${where}: muted copy on the page ground clears AA`,
				m.pageMutedInk >= 4.5,
				`${m.pageMutedInk}:1 (needs 4.5)`
			);
			// The three the showcase's own palettes would have failed loudest.
			check(
				`${where}: the accent clears AA as a fill, as the template requires`,
				m.fillPair >= 4.5,
				`primary under primary-foreground: ${m.fillPair}:1 (declared ${declared.primary} / ${declared.foreground})`
			);
			check(
				`${where}: a real Button's label clears AA on its own fill`,
				m.buttonInk >= 4.5,
				`${m.buttonInk}:1 on ${m.buttonFill}`
			);
			// #11 under all twenty. The nav label is the strictest surface in the
			// package — three composited layers — and it is the one the shell was
			// shipping a consumer-owned colour onto.
			check(
				`${where}: the active nav label clears AA on the chrome`,
				m.activeNavInk >= 4.5,
				`${m.activeNavInk}:1 (needs 4.5)`
			);
			check(
				`${where}: the resting nav label clears AA on the chrome`,
				m.restingNavInk >= 4.5,
				`${m.restingNavInk}:1 (needs 4.5)`
			);
			if (m.badgeInk !== null) {
				check(
					`${where}: the nav badge count clears AA on its tint`,
					m.badgeInk >= 4.5,
					`${m.badgeInk}:1 (needs 4.5)`
				);
			}
		}

		check(`palette catalogue/${mode}: no page error`, errors.length === 0, JSON.stringify(errors));
		await context.close();
	}
}

// ── The avatar load-state swap (#7) ─────────────────────────────────────────
// Driven over the real network: a genuine 404 and a genuine decode, which is
// the pair jsdom can only stub.
{
	const { context, page } = await open('surface=avatar');
	await page.waitForSelector('[data-probe="avatar-broken"] [data-slot="avatar"]');

	const measured = await page.evaluate(async () => {
		const read = (probe) => {
			const root = document.querySelector(`[data-probe="${probe}"]`);
			const image = root.querySelector('[data-slot="avatar-image"]');
			const fallback = root.querySelector('[data-slot="avatar-fallback"]');
			return {
				status: root.querySelector('[data-slot="avatar"]').getAttribute('data-status'),
				imageShown: image ? getComputedStyle(image).display !== 'none' : false,
				fallbackShown: fallback ? getComputedStyle(fallback).display !== 'none' : false,
				fallbackText: fallback?.textContent?.trim() ?? ''
			};
		};
		// Give the real request time to fail and the real image time to decode.
		await new Promise((resolve) => setTimeout(resolve, 800));
		return {
			broken: read('avatar-broken'),
			loaded: read('avatar-loaded'),
			sourceless: read('avatar-sourceless')
		};
	});

	check(
		'avatar: a source that 404s falls back to the initials',
		measured.broken.status === 'error' &&
			measured.broken.fallbackShown &&
			!measured.broken.imageShown &&
			measured.broken.fallbackText === 'OP',
		JSON.stringify(measured.broken)
	);
	check(
		'avatar: a source that resolves takes over from the fallback',
		measured.loaded.status === 'loaded' &&
			measured.loaded.imageShown &&
			!measured.loaded.fallbackShown,
		JSON.stringify(measured.loaded)
	);
	check(
		'avatar: no source at all still shows the initials',
		measured.sourceless.fallbackShown && measured.sourceless.fallbackText === 'OP',
		JSON.stringify(measured.sourceless)
	);
	await context.close();
}

// ── DetailPanel's title face (#9) ────────────────────────────────────────────
// A class name is not the claim: font-mono / font-display are Tailwind
// utilities, and this package's other gates exist precisely because a
// utility can be present in the DOM with no compiled rule behind it. The
// claim is the RESOLVED computed font-family.
{
	const { context, page } = await open('surface=detail-panel');
	await page.waitForSelector('[data-probe="mono"] h2');

	const fonts = await page.evaluate(() => ({
		mono: getComputedStyle(document.querySelector('[data-probe="mono"] h2')).fontFamily,
		display: getComputedStyle(document.querySelector('[data-probe="display"] h2')).fontFamily
	}));

	check(
		'DetailPanel: default titleFace resolves the mono (code) family',
		fonts.mono.includes('JetBrains Mono'),
		fonts.mono
	);
	check(
		'DetailPanel: titleFace="display" resolves the display (Fraunces) family',
		fonts.display.includes('Fraunces'),
		fonts.display
	);
	check('DetailPanel: the two settings resolve to different families', fonts.mono !== fonts.display, `mono: ${fonts.mono} | display: ${fonts.display}`);

	await context.close();
}

// ── Scoped theming (#8) ──────────────────────────────────────────────────────
// The claim jsdom cannot make: it never resolves a var() chain, so it cannot
// tell "resolved once at :root, then inherited unchanged below it" apart from
// "resolved live at the element the class sits on" — only a real cascade can.
// Three identical probe sets (see App.svelte): the page default, a subtree
// overriding --ds-color-* only, and a subtree carrying a scoped .dark class.
{
	const { context, page } = await open('surface=theming');
	await page.waitForSelector('[data-probe="root"] [data-slot="bg-background"]');

	// `bg-accent` is measured but held apart from the identical-value claim
	// below. Since #24 it is a TINT of --ds-color-primary rather than an alias
	// of a surface rung, so under an override that sets every key to one colour
	// it lands on that colour at 12% alpha, not on the colour itself. It still
	// has to follow the override, which is asserted separately.
	const SURFACE_SLOTS = [
		['bg-background', 'backgroundColor'],
		['bg-card', 'backgroundColor'],
		['bg-popover', 'backgroundColor'],
		['bg-muted', 'backgroundColor'],
		['bg-secondary', 'backgroundColor'],
		['border-input', 'borderTopColor'],
		['text-muted-foreground', 'color']
	];
	const SLOTS = [...SURFACE_SLOTS, ['bg-accent', 'backgroundColor']];

	const measured = await page.evaluate((slots) => {
		const read = (probe) => {
			const root = document.querySelector(`[data-probe="${probe}"]`);
			return Object.fromEntries(
				slots.map(([slot, prop]) => [
					slot,
					getComputedStyle(root.querySelector(`[data-slot="${slot}"]`))[prop]
				])
			);
		};
		return { root: read('root'), scopedDsColor: read('scoped-ds-color'), scopedDark: read('scoped-dark') };
	}, SLOTS);

	// The scoped subtree set every --ds-color-* key these utilities read to the
	// SAME single colour, so every slot inside it must resolve to that one
	// value — both packages' halves of the surface, one documented lever.
	const overrideValues = new Set(
		SURFACE_SLOTS.map(([slot]) => measured.scopedDsColor[slot])
	);
	check(
		'scoped --ds-color-* override: every shadcn surface utility in the subtree resolves to it',
		overrideValues.size === 1,
		JSON.stringify(measured.scopedDsColor)
	);
	// The accent tint reaches the override too — it just arrives carrying an
	// alpha, so it is checked for the override's own colour rather than for
	// equality with the opaque surfaces.
	check(
		'scoped --ds-color-* override: the accent tint follows it as well',
		measured.scopedDsColor['bg-accent'] !== measured.root['bg-accent'] &&
			/0\.55|55%/.test(measured.scopedDsColor['bg-accent']),
		`${measured.root['bg-accent']} -> ${measured.scopedDsColor['bg-accent']}`
	);
	// And it must actually have moved something, not coincidentally matched
	// the page default (which would pass the check above for the wrong reason).
	const unmoved = SLOTS.filter(([slot]) => measured.scopedDsColor[slot] === measured.root[slot]).map(
		([slot]) => slot
	);
	check(
		'scoped --ds-color-* override: differs from the unscoped page default',
		unmoved.length === 0,
		`unchanged from root: ${JSON.stringify(unmoved)} (root ${JSON.stringify(measured.root)}, scoped ${JSON.stringify(measured.scopedDsColor)})`
	);

	// A scoped .dark wrapper must move the WHOLE surface within it — every
	// slot, both packages' keys — not just the half that happened to work
	// before #8 (bg-card's bare-name lever) or none of it (bg-background's
	// frozen theme-name lever).
	const stillLight = SLOTS.filter(([slot]) => measured.scopedDark[slot] === measured.root[slot]).map(
		([slot]) => slot
	);
	check(
		'scoped .dark wrapper: moves every shadcn utility in the subtree',
		stillLight.length === 0,
		`unchanged from the light root: ${JSON.stringify(stillLight)} (root ${JSON.stringify(measured.root)}, scoped-dark ${JSON.stringify(measured.scopedDark)})`
	);

	await context.close();
}

// ── The console-dashboard primitives (design-system#15) ────────────────────
// jsdom cannot resolve any --ds-color-status-*/--ds-color-primary var() chain
// — src/test/ proves the structural claims (which attribute carries which
// literal), and these three claims need a real cascade instead: ArcGauge's
// tone actually resolves to a distinct paint colour per tone, StatusBadge's
// new `primary` extension resolves to a real, distinct colour rather than
// falling through to an unstyled default, and BarRow's fill genuinely covers
// the percentage of its track that `pct` asked for — not just a `width`
// string that happens to say so.
{
	const { context, page, errors } = await open('surface=console');
	await page.waitForSelector('[data-probe="arc-success"] svg circle');

	const measured = await page.evaluate(
		({ tones, statuses }) => {
			const arc = Object.fromEntries(
				tones.map((tone) => {
					const svg = document.querySelector(`[data-probe="arc-${tone}"] svg`);
					const fillArc = svg.querySelectorAll('circle')[1];
					return [tone, getComputedStyle(fillArc).stroke];
				})
			);

			const badge = Object.fromEntries(
				statuses.map((status) => {
					const root = document.querySelector(`[data-probe="badge-${status}"]`);
					return [
						status,
						{
							chip: getComputedStyle(root.querySelector('.ds-chip')).color,
							dot: getComputedStyle(root.querySelector('.ds-dot')).backgroundColor
						}
					];
				})
			);

			const barRoot = document.querySelector('[data-probe="bar-row"]');
			const track = barRoot.querySelector('.grid > span:nth-child(2)');
			const fill = track.querySelector('span');
			const trackRect = track.getBoundingClientRect();
			const fillRect = fill.getBoundingClientRect();

			return {
				arc,
				badge,
				bar: { trackWidth: trackRect.width, fillWidth: fillRect.width }
			};
		},
		{ tones: ['success', 'warning', 'error'], statuses: ['success', 'warning', 'error', 'info', 'neutral', 'primary'] }
	);

	// This package's palette is OKLCH (README's non-negotiable colour space),
	// and Chromium serialises a resolved computed colour back in whichever
	// function the specified value used — so a genuinely resolved value here
	// reads `oklch(...)`, not `rgb(...)`. Either is a real colour; only the
	// literal unresolved `var(--…)` string is the failure this guards.
	const isResolvedColour = (value) => typeof value === 'string' && !value.includes('var(');

	for (const tone of ['success', 'warning', 'error']) {
		check(
			`ArcGauge ${tone}: stroke resolves to a real colour, not the unresolved var()`,
			isResolvedColour(measured.arc[tone]),
			measured.arc[tone]
		);
	}
	check(
		'ArcGauge: the three tones resolve to three visibly different colours',
		new Set(Object.values(measured.arc)).size === 3,
		JSON.stringify(measured.arc)
	);

	for (const status of ['success', 'warning', 'error', 'info', 'neutral', 'primary']) {
		check(
			`StatusBadge ${status}: chip ink resolves to a real colour`,
			isResolvedColour(measured.badge[status].chip),
			measured.badge[status].chip
		);
		check(
			`StatusBadge ${status}: dot fill resolves to a real colour`,
			isResolvedColour(measured.badge[status].dot),
			measured.badge[status].dot
		);
	}
	check(
		"StatusBadge primary: resolves to a colour distinct from every shared-vocabulary state's",
		!['success', 'warning', 'error', 'info', 'neutral'].some(
			(status) => measured.badge[status].chip === measured.badge.primary.chip
		),
		JSON.stringify(measured.badge)
	);

	const ratio = measured.bar.fillWidth / measured.bar.trackWidth;
	check(
		'BarRow: fill width resolves to ~42% of its track for pct=42',
		Math.abs(ratio - 0.42) < 0.02,
		`${(ratio * 100).toFixed(1)}% (${measured.bar.fillWidth}px / ${measured.bar.trackWidth}px)`
	);

	check('console primitives: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── Nested navigation ───────────────────────────────────────────────────────
// Four claims, none of which jsdom can make. The indent geometry and the guide
// border are layout facts and jsdom has no layout. The chevron's rotation is a
// resolved `transform`, and jsdom returns the unresolved literal. Whether a
// fifteen-row tree fits a 360px drawer is a question only an engine answers.
//
// The overflow check is a DOM WALK rather than `documentElement.scrollWidth`,
// and the difference is not pedantry: the nav is `overflow-y: auto`, which
// computes `overflow-x` to `auto` as well, so a child wider than the rail
// becomes a scrollbar INSIDE the nav and the document-level number never moves.
// That is the same blindness #5 was hiding behind, one component along, so the
// element-by-element measurement is the assertion and the naive number is
// printed beside it, unasserted, for contrast.
{
	// The rail at rest, wide. The tree is open with nothing clicked.
	{
		const { context, page, errors } = await open('surface=nested');
		await page.waitForSelector('.ds-nav-branch');

		const measured = await page.evaluate(() => {
			const branch = document.querySelector('.ds-nav-branch');
			const parentLink = branch.querySelector('.ds-nav-item');
			const control = branch.querySelector('[data-ds-nav-disclosure]');
			const panel = document.getElementById(control.getAttribute('aria-controls'));
			const child = panel.querySelector('.ds-nav-item');
			const parentLabel = parentLink.querySelector('span:not(.ds-nav-indicator)');
			const childLabel = child.querySelector('span');
			const panelStyle = getComputedStyle(panel);
			return {
				expanded: control.getAttribute('aria-expanded'),
				panelDisplay: panelStyle.display,
				chevronTransform: getComputedStyle(control.querySelector('svg')).transform,
				parentLabelLeft: parentLabel.getBoundingClientRect().left,
				childLabelLeft: childLabel.getBoundingClientRect().left,
				childRight: child.getBoundingClientRect().right,
				railRight: document.querySelector('.ds-shell-rail').getBoundingClientRect().right,
				activeChildren: panel.querySelectorAll('[aria-current="page"]').length,
				// Scoped to the WHOLE nav, deliberately. The panel-scoped count above
				// cannot see the parent link, which sits outside it — so it was
				// structurally incapable of catching the parent and its own child both
				// claiming to be the page, which is exactly what shipped in 2026.8.1.
				activeRows: document.querySelectorAll('.ds-nav [aria-current="page"]').length,
				activeTints: document.querySelectorAll('.ds-nav [data-active="true"]').length,
				indicators: document.querySelectorAll('.ds-nav .ds-nav-indicator').length
			};
		});

		// Derived-by-default, proved where it counts: first paint, no click.
		check(
			'nested: the group holding the current page is open on first paint',
			measured.expanded === 'true' && measured.panelDisplay !== 'none',
			`aria-expanded=${measured.expanded}, display ${measured.panelDisplay}`
		);
		check(
			'nested: exactly one child is marked the current page',
			measured.activeChildren === 1,
			`${measured.activeChildren} rows carry aria-current`
		);
		// The claim the panel-scoped check above cannot make. Two elements carrying
		// aria-current="page" is an ARIA defect on its own, and two tints plus two
		// edge bars leave the rail unable to say where you are.
		check(
			'nested: exactly ONE row in the whole nav claims to be the page',
			measured.activeRows === 1 && measured.activeTints === 1 && measured.indicators === 1,
			`aria-current ${measured.activeRows}, data-active ${measured.activeTints}, indicators ${measured.indicators}`
		);
		// The rotation IS the open state for a sighted user. A class-name check
		// passes while the transform is dead; the resolved matrix cannot.
		check(
			'nested: the open chevron is actually rotated',
			measured.chevronTransform !== 'none' && measured.chevronTransform !== '',
			measured.chevronTransform
		);
		// The alignment the CSS comment claims, measured rather than argued.
		check(
			'nested: a child label lines up under its parent’s',
			Math.abs(measured.childLabelLeft - measured.parentLabelLeft) < 1,
			`child ${measured.childLabelLeft.toFixed(1)}px vs parent ${measured.parentLabelLeft.toFixed(1)}px`
		);
		check(
			'nested: a child row stays inside the rail',
			measured.childRight <= measured.railRight + 0.5,
			`child right ${measured.childRight.toFixed(1)}px vs rail right ${measured.railRight.toFixed(1)}px`
		);
		check('nested: no page error', errors.length === 0, JSON.stringify(errors));
		await context.close();
	}

	// The phone. 360px is where a nested tree breaks if it is going to.
	for (const width of [360, 320]) {
		const { context, page } = await open('surface=nested', { width, height: 780 });
		await page.click('[data-testid="ds-shell-menu"]');
		await page.waitForSelector('[data-testid="ds-shell-drawer"]');
		await page.waitForSelector('.ds-nav-branch [data-ds-nav-disclosure]');
		// The drawer slides in from translateX(-100%), so a walk taken on the
		// frame after the click reports the entire drawer subtree as off-canvas —
		// 82 "offenders" that are the animation, not the layout. Measuring the
		// SETTLED box is the whole claim; this is what makes the number mean
		// something rather than being tuned around.
		await page.waitForFunction(() =>
			document.getAnimations().every((animation) => animation.playState !== 'running')
		);

		// The drawer overlays the page: a utility on the same element (`relative`,
		// `sticky`) outranks the base-layer `position: fixed` and leaves it in
		// flow, squeezing the bar beside it.
		const drawer = await page.evaluate(() => {
			const rail = document.querySelector('.ds-shell-rail');
			return {
				position: getComputedStyle(rail).position,
				barWidth: document.querySelector('.ds-shell-bar').getBoundingClientRect().width
			};
		});
		check(
			`nested @ ${width}px: the open drawer is position:fixed and the bar keeps the full width`,
			drawer.position === 'fixed' && Math.round(drawer.barWidth) === width,
			`position ${drawer.position}, bar ${Math.round(drawer.barWidth)}px of ${width}px`
		);

		const measured = await page.evaluate((viewport) => {
			// Every element in the document, not the document's own scrollWidth: a
			// scroll container hides its contents' overflow from the naive check,
			// and the nav is one.
			const offenders = [];
			for (const el of document.querySelectorAll('body *')) {
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 && rect.height === 0) continue;
				if (rect.right > viewport + 0.5 || rect.left < -0.5) {
					offenders.push({
						tag: el.tagName.toLowerCase(),
						cls: (el.getAttribute('class') ?? '').slice(0, 60),
						left: Math.round(rect.left),
						right: Math.round(rect.right)
					});
				}
			}
			const nav = document.querySelector('.ds-nav');
			const drawer = document.querySelector('[data-testid="ds-shell-drawer"]');
			const control = document.querySelector('.ds-nav-branch [data-ds-nav-disclosure]');
			return {
				offenders: offenders.slice(0, 6),
				offenderCount: offenders.length,
				navScrollsSideways: nav.scrollWidth > nav.clientWidth,
				drawerWidth: drawer.getBoundingClientRect().width,
				documentScroll: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth,
				childrenVisible: document.querySelectorAll('.ds-nav-children:not([hidden]) .ds-nav-item')
					.length,
				controlHit: control.getBoundingClientRect().width
			};
		}, width);

		check(
			`nested @${width}px: nothing in the document exceeds the viewport`,
			measured.offenderCount === 0,
			measured.offenderCount === 0
				? `0 offenders (drawer ${measured.drawerWidth.toFixed(0)}px)`
				: `${measured.offenderCount}: ${JSON.stringify(measured.offenders)}`
		);
		// The half a DOM walk alone would miss: contained overflow is still
		// sideways scroll, it is just scoped to a box.
		check(
			`nested @${width}px: the nav itself does not scroll sideways`,
			!measured.navScrollsSideways,
			`nav scrollWidth vs clientWidth: ${measured.navScrollsSideways ? 'scrolls' : 'fits'}`
		);
		check(
			`nested @${width}px: the drawer renders the tree, open`,
			measured.childrenVisible > 0,
			`${measured.childrenVisible} disclosed rows`
		);
		checks.push({
			name: `nested @${width}px: document-level check (the blind one)`,
			ok: true,
			detail: `documentElement.scrollWidth ${measured.documentScroll} vs innerWidth ${measured.innerWidth}`
		});
		await context.close();
	}

	// Keyboard activation, driven for real. jsdom does not implement a button's
	// activation behaviour, so no unit test there can prove Enter or Space opens
	// the group — it can only assert the element is a `<button>` and trust the
	// platform. This is where the platform actually is.
	for (const key of ['Enter', 'Space']) {
		const { context, page } = await open('surface=nested');
		await page.waitForSelector('.ds-nav-branch');
		// The second branch is the one that starts CLOSED, so an open is observable.
		const control = page.locator('[data-ds-nav-disclosure]').nth(1);
		await control.focus();
		const before = await control.getAttribute('aria-expanded');
		await page.keyboard.press(key);
		await page.waitForTimeout(100);
		const after = await control.getAttribute('aria-expanded');

		check(
			`nested: ${key} on the chevron opens the group`,
			before === 'false' && after === 'true',
			`aria-expanded ${before} → ${after}`
		);
		await context.close();
	}

	// Escape from inside an open group, in a real engine: it must close the group
	// and put focus back on the control, not strand the caret on a row that has
	// just been hidden. jsdom agrees, but jsdom also has no notion of what is
	// actually focusable, so the claim is worth making where it is real.
	{
		const { context, page } = await open('surface=nested');
		await page.waitForSelector('.ds-nav-children:not([hidden]) .ds-nav-item');
		await page.locator('.ds-nav-children:not([hidden]) .ds-nav-item').first().focus();
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);

		const measured = await page.evaluate(() => ({
			expanded: document
				.querySelector('.ds-nav-branch [data-ds-nav-disclosure]')
				?.getAttribute('aria-expanded'),
			focusIsControl:
				document.activeElement === document.querySelector('.ds-nav-branch [data-ds-nav-disclosure]'),
			focusTag: document.activeElement?.tagName.toLowerCase()
		}));

		check(
			'nested: Escape inside an open group closes it and returns focus to the control',
			measured.expanded === 'false' && measured.focusIsControl,
			`aria-expanded ${measured.expanded}, focus on <${measured.focusTag}>`
		);
		await context.close();
	}

	// Reduced motion. The chevron's rotation is how the open state reads for a
	// sighted user, so the reduced-motion rule has to kill the TRANSITION without
	// killing the transform — suppress both and the control stops saying anything.
	// Neither half is visible to jsdom or to a compiled-CSS gate: one is a media
	// query, the other a resolved matrix.
	for (const motion of ['no-preference', 'reduce']) {
		const context = await browser.newContext({
			viewport: { width: 1280, height: 800 },
			reducedMotion: motion
		});
		const page = await context.newPage();
		await page.goto(`http://127.0.0.1:${PORT}/index.html?surface=nested`, { waitUntil: 'load' });
		await page.waitForSelector('[data-ds-nav-disclosure] svg');

		const measured = await page.evaluate(() => {
			const style = getComputedStyle(document.querySelector('[data-ds-nav-disclosure] svg'));
			return { duration: style.transitionDuration, transform: style.transform };
		});

		const wantsStill = motion === 'reduce';
		check(
			`nested, prefers-reduced-motion: ${motion}: the chevron ${wantsStill ? 'does not animate' : 'animates'}`,
			wantsStill ? measured.duration === '0s' : parseFloat(measured.duration) > 0,
			`transition-duration ${measured.duration}`
		);
		check(
			`nested, prefers-reduced-motion: ${motion}: the open state still reads off the transform`,
			measured.transform !== 'none' && measured.transform !== '',
			measured.transform
		);
		await context.close();
	}

	// A collapsed rail renders no tree at all, and the parent stays a link. The
	// claim is about a real 3.5rem column, so it is measured here rather than
	// asserted off a class name.
	{
		const { context, page } = await open('surface=nested&collapsible=1');
		await page.click('[data-testid="ds-rail-collapse"]');
		await page.waitForFunction(
			() => document.querySelector('.ds-shell-rail')?.dataset.collapsed === 'true'
		);
		// The rail's width transitions over 200ms; reading it on the next frame
		// reports 243px and reads like the collapse never happened.
		await page.waitForFunction(() =>
			document.getAnimations().every((animation) => animation.playState !== 'running')
		);

		const measured = await page.evaluate(() => ({
			railWidth: document.querySelector('.ds-shell-rail').getBoundingClientRect().width,
			branches: document.querySelectorAll('.ds-nav-branch').length,
			controls: document.querySelectorAll('[data-ds-nav-disclosure]').length,
			childRows: document.querySelectorAll('.ds-nav-children .ds-nav-item').length,
			parentStillLinks: !!document.querySelector('.ds-nav-item[href="#/education"]')
		}));

		check(
			'nested, collapsed rail: no disclosure control and no child rows',
			measured.branches === 0 && measured.controls === 0 && measured.childRows === 0,
			`branches ${measured.branches}, controls ${measured.controls}, child rows ${measured.childRows} at ${measured.railWidth.toFixed(0)}px`
		);
		check(
			'nested, collapsed rail: the parent is still a link to its own page',
			measured.parentStillLinks,
			`parent link present: ${measured.parentStillLinks}`
		);
		await context.close();
	}
}

// ── The content measure ─────────────────────────────────────────────────────
// This is the check the feature exists for, and it is a WIDTH, so it can only
// be made here. Every claim the scale makes is a resolved length: `80rem`
// against the root font size, `72ch` against the body face as loaded, a cap
// that binds only once the viewport is wide enough to reach it, and a box
// centred by auto margins inside a flex column. jsdom resolves none of them —
// it hands back the unresolved `var()` literal for `max-width` and zero for
// every rect — so a unit test there would pass against a build whose
// stylesheet was never imported. A class-name assertion is not a measurement.
//
// 2560px is the case that motivated the feature: on a real 4K panel the
// surveyed consumer was using 15-79% of the width available, and the shell had
// no opinion to offer.
{
	// Every tier, measured under one page body, so the only variable is the prop.
	const MEASURES = ['prose', 'page', 'wide', 'full'];

	/** Read the content box's geometry, plus what the browser resolved the cap to. */
	const readGeometry = async (page) => {
		// `ch` is a font metric, so nothing here may be measured before the font
		// is settled. This harness ships no `@font-face` at all — it compiles the
		// consumer's stylesheet over the built package and the body stack falls
		// through to a locally available face — so `fonts.ready` resolves
		// immediately today. It is awaited anyway: the day this harness self-hosts
		// a face, every number below would start being read a frame early, and
		// that failure would show up as a flake in CI rather than as an error
		// anyone could read. The resolved family is reported with the numbers for
		// the same reason — a Linux runner resolves a different fallback than a
		// Mac, and a check about characters should say which characters.
		await page.evaluate(() => document.fonts.ready);
		return page.evaluate(() => {
			const main = document.querySelector('#ds-main');
			const box = main.firstElementChild;
			const rect = box.getBoundingClientRect();
			const mainRect = main.getBoundingClientRect();
			const style = getComputedStyle(box);

			// What `72ch` MEANS in this box, measured rather than assumed: a probe
			// sized in the unit under test, in the box's own inherited font. If the
			// face or size ever changes, this moves with it, which is the whole
			// argument for stating a reading measure in characters.
			const probe = document.createElement('div');
			probe.style.cssText = 'position:absolute;visibility:hidden;width:72ch';
			box.appendChild(probe);
			const oneProseMeasure = probe.getBoundingClientRect().width;
			probe.remove();

			// How many characters of the app's ACTUAL running text land on a line.
			// This is the claim `prose` makes, and it is not the same number as
			// `72ch`: `ch` resolves against the box's own font, while the copy
			// inside it is a step smaller, so the real line is longer than 72
			// characters. Measured off a sample in the paragraph's own font rather
			// than assumed from the unit.
			const copy = document.querySelector('[data-probe="measure-copy"]');
			let charsPerLine = null;
			if (copy) {
				const sample = document.createElement('span');
				const SAMPLE = 'abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz';
				sample.textContent = SAMPLE;
				sample.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
				copy.appendChild(sample);
				const advance = sample.getBoundingClientRect().width / SAMPLE.length;
				sample.remove();
				charsPerLine = Math.round(copy.clientWidth / advance);
			}

			return {
				boxWidth: Math.round(rect.width * 100) / 100,
				available: main.clientWidth,
				gapLeft: Math.round((rect.left - mainRect.left) * 100) / 100,
				gapRight: Math.round((mainRect.right - rect.right) * 100) / 100,
				maxWidth: style.maxWidth,
				hasAttribute: box.hasAttribute('data-measure'),
				hasClass: box.classList.contains('ds-shell-measure'),
				rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
				oneProseMeasure: Math.round(oneProseMeasure * 100) / 100,
				charsPerLine,
				face: copy ? getComputedStyle(copy).fontFamily.split(',')[0].replace(/"/g, '') : 'n/a',
				mainScroll: main.scrollWidth,
				mainClient: main.clientWidth
			};
		});
	};

	// ── At 2560px, where every cap binds ────────────────────────────────────
	{
		const at = {};
		for (const measure of MEASURES) {
			const { context, page } = await open(`surface=measure&measure=${measure}`, {
				width: 2560,
				height: 1440
			});
			await page.waitForSelector('#ds-main');
			at[measure] = await readGeometry(page);
			await context.close();
		}

		// `full` is the anchor: no cap, so the box IS the available width. If this
		// ever stops holding, the additivity claim below is measuring nothing.
		check(
			'measure @2560px, full: the content box is the whole available width',
			at.full.boxWidth === at.full.available && at.full.maxWidth === 'none',
			`box ${at.full.boxWidth}px of ${at.full.available}px available, max-width ${at.full.maxWidth}`
		);

		// The rem tiers, against the arithmetic the README states rather than
		// against a number typed twice: 80rem and 120rem at the root font size
		// this document actually resolved.
		for (const [measure, rem] of [
			['page', 80],
			['wide', 120]
		]) {
			const expected = rem * at[measure].rootFontSize;
			check(
				`measure @2560px, ${measure}: the rendered width is ${rem}rem`,
				Math.abs(at[measure].boxWidth - expected) < 1,
				`box ${at[measure].boxWidth}px vs ${rem}rem = ${expected}px (root ${at[measure].rootFontSize}px), max-width ${at[measure].maxWidth}`
			);
		}

		// `prose` is stated in characters, so it is checked in characters: the box
		// must be exactly what `72ch` measures in its own font. A `rem` slipped in
		// here would pass a "narrower than page" test and fail this one.
		check(
			'measure @2560px, prose: the rendered width is 72ch in the box’s own face',
			Math.abs(at.prose.boxWidth - at.prose.oneProseMeasure) < 1,
			`box ${at.prose.boxWidth}px vs a 72ch probe at ${at.prose.oneProseMeasure}px`
		);

		// A reading measure that spanned a 4K panel would be worse than the
		// per-page guesses it replaces, which is the entire reason `prose` exists
		// as a tier of its own rather than as the narrow end of `page`. So the
		// claim is asserted in the terms it is actually made in — characters on a
		// line, the typographic criterion — rather than as a pixel threshold
		// someone picked. 45-90 is the accepted band for continuous text; the
		// same paragraph at `full` on this viewport is what the tier exists to
		// prevent, so it is measured beside it.
		check(
			'measure @2560px, prose: running text lands in a readable 45-90 character band',
			at.prose.charsPerLine >= 45 && at.prose.charsPerLine <= 90,
			`prose ${at.prose.charsPerLine} characters per line (box ${at.prose.boxWidth}px, face ${at.prose.face}), against ${at.full.charsPerLine} at full on the same viewport`
		);

		// The scale is monotonic, in the order it is documented in. A tier that
		// sorted out of order would make the vocabulary a lie at the call site.
		check(
			'measure @2560px: the scale widens strictly, narrowest first',
			at.prose.boxWidth < at.page.boxWidth &&
				at.page.boxWidth < at.wide.boxWidth &&
				at.wide.boxWidth < at.full.boxWidth,
			MEASURES.map((m) => `${m} ${at[m].boxWidth}`).join(' < ')
		);

		// Capped means CENTRED, not left-aligned with dead space on one side.
		// Auto margins inside a flex column are the mechanism, and whether they
		// resolve is exactly the kind of thing only a layout engine knows.
		for (const measure of ['prose', 'page', 'wide']) {
			check(
				`measure @2560px, ${measure}: the capped box is centred, not flush left`,
				Math.abs(at[measure].gapLeft - at[measure].gapRight) <= 1 && at[measure].gapLeft > 0,
				`gaps ${at[measure].gapLeft}px / ${at[measure].gapRight}px`
			);
		}

		// The number the whole feature was argued from, restated as evidence.
		checks.push({
			name: 'measure @2560px: width used, per tier (the survey number)',
			ok: true,
			detail: MEASURES.map(
				(m) => `${m} ${Math.round((at[m].boxWidth / at[m].available) * 100)}%`
			).join(', ')
		});
	}

	// ── At 1440px, where the wide tiers must be inert ────────────────────────
	// A ceiling, never a floor. `page` caps at 80rem and a laptop has less than
	// that available, so it must change NOTHING there — a measure that narrowed
	// a laptop to make a 4K panel tidy would be a regression for the common case.
	{
		const at = {};
		for (const measure of MEASURES) {
			const { context, page } = await open(`surface=measure&measure=${measure}`, {
				width: 1440,
				height: 900
			});
			await page.waitForSelector('#ds-main');
			at[measure] = await readGeometry(page);
			await context.close();
		}

		for (const measure of ['page', 'wide']) {
			check(
				`measure @1440px, ${measure}: the cap is out of reach and changes nothing`,
				at[measure].boxWidth === at.full.boxWidth,
				`${measure} ${at[measure].boxWidth}px vs full ${at.full.boxWidth}px (${at[measure].available}px available)`
			);
		}
		check(
			'measure @1440px, prose: a reading measure still binds on a laptop',
			at.prose.boxWidth < at.full.boxWidth,
			`prose ${at.prose.boxWidth}px vs full ${at.full.boxWidth}px`
		);
	}

	// ── Additivity, in the browser ───────────────────────────────────────────
	// The operator's hard constraint: no consumer that omits `measure` may render
	// one pixel differently. `surface=shell` passes no `measure` prop at all —
	// it is the shell every existing consumer gets — so it must carry no
	// attribute, no class, no cap, and no margin, at every width.
	for (const width of [2560, 1440, 360]) {
		const { context, page } = await open('surface=shell', { width, height: 900 });
		await page.waitForSelector('#ds-main');
		const bare = await readGeometry(page);
		await context.close();

		check(
			`measure @${width}px: a shell that never names measure is uncapped and unmoved`,
			!bare.hasAttribute &&
				!bare.hasClass &&
				bare.maxWidth === 'none' &&
				bare.boxWidth === bare.available &&
				bare.gapLeft === 0,
			`attribute ${bare.hasAttribute}, class ${bare.hasClass}, max-width ${bare.maxWidth}, box ${bare.boxWidth}px of ${bare.available}px, left gap ${bare.gapLeft}px`
		);
	}

	// `full` passed explicitly has to land in the same place as omitting it, or
	// an app adopting the scale and then deciding one layout wants no cap would
	// get something subtly different from where it started.
	{
		const { context: c1, page: p1 } = await open('surface=shell', { width: 2560, height: 1440 });
		await p1.waitForSelector('#ds-main');
		const omitted = await readGeometry(p1);
		await c1.close();
		const { context: c2, page: p2 } = await open('surface=measure&measure=full', {
			width: 2560,
			height: 1440
		});
		await p2.waitForSelector('#ds-main');
		const explicit = await readGeometry(p2);
		await c2.close();

		check(
			'measure @2560px: measure="full" renders where omitting it renders',
			omitted.boxWidth === explicit.boxWidth &&
				omitted.maxWidth === explicit.maxWidth &&
				omitted.gapLeft === explicit.gapLeft &&
				explicit.hasAttribute === false,
			`omitted ${omitted.boxWidth}px/${omitted.maxWidth}, explicit ${explicit.boxWidth}px/${explicit.maxWidth}`
		);
	}

	// ── At 360px, where nothing may overflow ─────────────────────────────────
	// No tier caps anything this narrow, so the interesting failure is the
	// opposite one: a `min-width` typed for a `max-width`, or a `ch` value that
	// forces a floor, would push the page sideways here and nowhere else. The
	// DOM walk is the assertion for the reason #5 and the nested nav both
	// established — the content region is its own scroller, so the document
	// level number cannot move.
	for (const measure of MEASURES) {
		const { context, page } = await open(`surface=measure&measure=${measure}`, {
			width: 360,
			height: 780
		});
		await page.waitForSelector('#ds-main');

		const measured = await page.evaluate((viewport) => {
			/**
			 * Content inside a box that scrolls sideways is CONTAINED, not
			 * overflowing — a wide table in rendered prose is the intended
			 * behaviour, and its cells legitimately sit past the viewport while
			 * the page does not move. The exemption is narrow on purpose: the
			 * scroller itself must fit, so a scroller that is ITSELF too wide is
			 * still an offender and its contents are still counted through it.
			 */
			const containedByAScroller = (el) => {
				for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
					const overflowX = getComputedStyle(node).overflowX;
					if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
					const box = node.getBoundingClientRect();
					if (box.right <= viewport + 0.5 && box.left >= -0.5) return true;
				}
				return false;
			};

			const offenders = [];
			for (const el of document.querySelectorAll('body *')) {
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 && rect.height === 0) continue;
				if (rect.right > viewport + 0.5 || rect.left < -0.5) {
					if (containedByAScroller(el)) continue;
					offenders.push({
						tag: el.tagName.toLowerCase(),
						cls: (el.getAttribute('class') ?? '').slice(0, 60),
						right: Math.round(rect.right)
					});
				}
			}
			const main = document.querySelector('#ds-main');
			return {
				offenderCount: offenders.length,
				worst: offenders[0] ? `${offenders[0].tag}.${offenders[0].cls} right ${offenders[0].right}` : 'none',
				mainOverflow: main.scrollWidth - main.clientWidth,
				documentScroll: document.documentElement.scrollWidth
			};
		}, 360);

		check(
			`measure @360px, ${measure}: nothing in the document exceeds the viewport`,
			measured.offenderCount === 0,
			`${measured.offenderCount} offender(s); worst: ${measured.worst}`
		);
		check(
			`measure @360px, ${measure}: the content region does not scroll sideways`,
			measured.mainOverflow <= 0,
			`main scrollWidth − clientWidth = ${measured.mainOverflow}px (document-level, blind: ${measured.documentScroll})`
		);
		await context.close();
	}
}

// ── The measure, on a block INSIDE a page (#22) ─────────────────────────────
// The shell's own content box wants the measure AND the centring. A block
// within a page wants only the measure: `.ds-shell-measure` applied to a set of
// left-anchored paragraphs indented them ~207px from their own label in a
// consuming app. Both halves of that are widths, so both are measured here.
{
	// `wide` on purpose — the route this is FOR is one legitimately set wide
	// (a dashboard, a table) that also carries explanatory running text.
	const { context, page } = await open('surface=measure&measure=wide', {
		width: 2560,
		height: 1440
	});
	await page.waitForSelector('[data-probe="measure-block"]');
	await page.evaluate(() => document.fonts.ready);

	const measured = await page.evaluate(() => {
		const block = document.querySelector('[data-probe="measure-block"]');
		const wrap = document.querySelector('[data-probe="measure-block-wrap"]');
		const heading = document.querySelector('h1');
		return {
			blockWidth: block.getBoundingClientRect().width,
			wrapWidth: wrap.getBoundingClientRect().width,
			blockLeft: Math.round(block.getBoundingClientRect().left),
			headingLeft: Math.round(heading.getBoundingClientRect().left),
			marginInline: getComputedStyle(block).marginInlineStart,
			resolvedCap: getComputedStyle(block).maxWidth,
			family: getComputedStyle(block).fontFamily
		};
	});

	check(
		'.ds-measure caps a block inside a page',
		measured.blockWidth < measured.wrapWidth &&
			Math.abs(measured.blockWidth - parseFloat(measured.resolvedCap)) < 1,
		`block ${measured.blockWidth.toFixed(0)}px inside a ${measured.wrapWidth.toFixed(0)}px page, cap resolved to ${measured.resolvedCap} (${measured.family})`
	);
	// The whole reason it is a second class. A centred block is the defect.
	check(
		'.ds-measure does NOT centre it — it stays on the page\'s own left edge',
		measured.blockLeft === measured.headingLeft && measured.marginInline === '0px',
		`block left ${measured.blockLeft}px vs heading left ${measured.headingLeft}px, margin-inline-start ${measured.marginInline}`
	);
	// It has to track the package's own property, or an app has gained nothing
	// over the `max-w-[72ch]` it would otherwise have typed.
	await page.addStyleTag({ content: ':root { --ds-shell-measure-prose: 40ch; }' });
	await page.evaluate(() => document.fonts.ready);
	const retuned = await page.evaluate(
		() => document.querySelector('[data-probe="measure-block"]').getBoundingClientRect().width
	);
	check(
		'.ds-measure retunes with --ds-shell-measure-prose',
		retuned < measured.blockWidth,
		`${measured.blockWidth.toFixed(0)}px at 72ch -> ${retuned.toFixed(0)}px at 40ch`
	);
	await context.close();
}

// ── The content texture ─────────────────────────────────────────────────────
// Almost nothing this feature claims survives outside an engine. The picture is
// a resolved `background-image` — two `color-mix()` gradients over the app's own
// palette — so jsdom reports an empty string for it whether the stylesheet was
// imported or not. "Sits behind content" is a paint order. "Travels with the
// scroll" is `background-attachment`, which has no DOM trace whatsoever and can
// only be seen by scrolling and looking twice. "Does not print" is a media
// state. Every one of those is measured here.
{
	/** Read what the browser actually resolved on the shell's content region. */
	const readTexture = (page) =>
		page.evaluate(() => {
			const main = document.querySelector('#ds-main');
			const box = main.firstElementChild;
			const style = getComputedStyle(main);
			return {
				backgroundImage: style.backgroundImage,
				backgroundColor: style.backgroundColor,
				backgroundAttachment: style.backgroundAttachment,
				backgroundRepeat: style.backgroundRepeat,
				backgroundSize: style.backgroundSize,
				overflowY: style.overflowY,
				position: style.position,
				hasClass: main.classList.contains('ds-shell-texture'),
				attribute: main.getAttribute('data-texture'),
				children: main.children.length,
				boxBackgroundImage: getComputedStyle(box).backgroundImage,
				boxHasTexture: box.classList.contains('ds-shell-texture'),
				scrollable: main.scrollHeight - main.clientHeight,
				sideways: main.scrollWidth - main.clientWidth
			};
		});

	// ── It paints, and it paints on the region that scrolls ──────────────────
	{
		const { context, page } = await open('surface=texture&texture=grid');
		await page.waitForSelector('#ds-main');
		const on = await readTexture(page);

		check(
			'texture: a named texture resolves to two real gradient layers on the content region',
			on.backgroundImage !== 'none' &&
				(on.backgroundImage.match(/radial-gradient/g) ?? []).length === 2,
			`background-image ${on.backgroundImage.slice(0, 120)}…`
		);

		// The dead-affordance failure this package gates for everywhere else, in
		// its CSS-custom-property form: a var() chain that resolves to nothing
		// leaves the declaration invalid at computed-value time, and the element
		// silently paints no background at all. So the claim is that the inks
		// RESOLVED — no `var(` and no `color-mix(` survive in the computed value.
		check(
			'texture: both inks resolve through their var()/color-mix() fallbacks',
			!on.backgroundImage.includes('var(') && !on.backgroundImage.includes('color-mix('),
			`computed still contains var( ${on.backgroundImage.includes('var(')}, color-mix( ${on.backgroundImage.includes('color-mix(')}`
		);

		check(
			'texture: it travels with the content, not with the box (attachment: local, local)',
			on.backgroundAttachment === 'local, local',
			`background-attachment ${on.backgroundAttachment}, repeat ${on.backgroundRepeat}, size ${on.backgroundSize}`
		);

		// Which element carries it is the feature. `measure` caps the box below,
		// so a texture painted there would stop at the measure and read as a
		// stripe rather than as the floor the page sits on.
		check(
			'texture: the scroller carries it and the measured box does not',
			on.hasClass &&
				on.attribute === 'grid' &&
				!on.boxHasTexture &&
				on.boxBackgroundImage === 'none',
			`main class ${on.hasClass}/attr ${on.attribute}, box class ${on.boxHasTexture}/image ${on.boxBackgroundImage}`
		);

		// A background rather than a layer: nothing was added to the flex column,
		// and the region is still the scroller it was.
		check(
			'texture: no element is added to the content region, and it still scrolls',
			on.children === 1 && on.overflowY === 'auto' && on.scrollable > 0,
			`${on.children} child, overflow-y ${on.overflowY}, ${on.scrollable}px of scroll`
		);

		await context.close();
	}

	// ── An app retunes the inks in one declaration ───────────────────────────
	// The whole reason the four knobs are read through var() fallbacks at the
	// point of use rather than aliased at :root (design-system#8): an alias
	// resolves once, at :root, and a later or scoped override never reaches the
	// result. Read live, one declaration moves the picture.
	{
		const { context, page } = await open('surface=texture&texture=grid');
		await page.waitForSelector('#ds-main');
		const before = await readTexture(page);
		await page.addStyleTag({
			content: ':root { --ds-shell-texture-grid-ink: rgb(11, 22, 33); }'
		});
		const after = await readTexture(page);

		check(
			'texture: an app override of --ds-shell-texture-grid-ink reaches the painted grid',
			after.backgroundImage !== before.backgroundImage &&
				after.backgroundImage.includes('rgb(11, 22, 33)'),
			`override present in computed value: ${after.backgroundImage.includes('rgb(11, 22, 33)')}`
		);

		await page.addStyleTag({ content: ':root { --ds-shell-texture-grid-pitch: 48px; }' });
		const pitched = await readTexture(page);
		check(
			'texture: an app override of --ds-shell-texture-grid-pitch reaches the tile size',
			pitched.backgroundSize.includes('48px'),
			`background-size ${pitched.backgroundSize}`
		);

		// The corner is a knob because a radial-gradient position is PHYSICAL —
		// there is no logical form of `at 85%` — so an RTL app that wants the glow
		// at the reading-start corner has no other way to reach it short of
		// redeclaring the whole rule.
		await page.addStyleTag({ content: ':root { --ds-shell-texture-vignette-at: 15% -10%; }' });
		const moved = await readTexture(page);
		check(
			'texture: an app override of --ds-shell-texture-vignette-at moves the corner glow',
			moved.backgroundImage.includes('at 15%') && !moved.backgroundImage.includes('at 85%'),
			`vignette position in the computed value: ${moved.backgroundImage.slice(0, 60)}…`
		);

		await context.close();
	}

	// ── Configurations a real user reaches ───────────────────────────────────
	// `73-verification.md` names RTL and the largest font scale explicitly, and
	// forced-colors is where a decorative background is most likely to be
	// stripped by the UA rather than by anything in this package. None of the
	// three may cost the region its texture, its scroll, or its horizontal
	// containment.
	for (const [label, options, setup] of [
		['RTL', {}, (page) => page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'))],
		['a 24px root font size', {}, (page) => page.addStyleTag({ content: 'html { font-size: 24px }' })],
		['forced-colors: active', { forcedColors: 'active' }, null]
	]) {
		const { context, page } = await open('surface=texture&texture=grid', {
			width: 1280,
			height: 800,
			...options
		});
		await page.waitForSelector('#ds-main');
		if (setup) await setup(page);
		const under = await readTexture(page);
		const scrolls = await page.evaluate(() => {
			const main = document.querySelector('#ds-main');
			main.scrollTop = 400;
			const moved = main.scrollTop;
			main.scrollTop = 0;
			return moved;
		});

		check(
			`texture under ${label}: still painted, still scrolling, still contained`,
			under.backgroundImage !== 'none' && under.sideways <= 0 && scrolls === 400,
			`image ${under.backgroundImage === 'none' ? 'none' : 'present'}, sideways ${under.sideways}px, scrollTop ${scrolls}`
		);
		await context.close();
	}

	// ── It travels with the content, observed rather than asserted ───────────
	// The failure this is here to rule out is the one both surveyed apps have
	// shipped at some point: a texture pinned to the scroll container's border
	// box, hanging motionless while the page slides over it. That is invisible to
	// every other check in this repo — the DOM is identical either way and so is
	// the class — so it is observed at TWO instants, by photographing a strip of
	// bare floor before and after scrolling half a grid pitch.
	//
	// The control is the point. The same two photographs are taken again with
	// `background-attachment: scroll` forced on, where they MUST come back
	// identical; without it, "the buffers differ" would be an unfalsifiable claim
	// about a probe that might simply be noisy.
	{
		const STRIP = { x: 400, y: 400, width: 600, height: 200 };
		const HALF_PITCH = 15;

		/** Photograph a strip of floor, scroll half a pitch, photograph it again. */
		const shootAcrossScroll = async (page) => {
			await page.evaluate(() => {
				document.querySelector('#ds-main').scrollTop = 0;
			});
			await page.waitForTimeout(50);
			const atRest = await page.screenshot({ clip: STRIP });
			await page.evaluate((by) => {
				document.querySelector('#ds-main').scrollTop = by;
			}, HALF_PITCH);
			await page.waitForTimeout(50);
			const scrolled = await page.screenshot({ clip: STRIP });
			return { atRest, scrolled };
		};

		const { context, page } = await open('surface=texture&texture=grid&blank=1');
		await page.waitForSelector('#ds-main');
		const travelling = await shootAcrossScroll(page);
		check(
			`texture: the floor moves when the page is scrolled ${HALF_PITCH}px (half a grid pitch)`,
			!travelling.atRest.equals(travelling.scrolled),
			`strip ${STRIP.width}×${STRIP.height} of bare floor, ${travelling.atRest.length} vs ${travelling.scrolled.length} bytes, identical: ${travelling.atRest.equals(travelling.scrolled)}`
		);

		// The control, on the same page, same strip, same scroll.
		await page.addStyleTag({
			content: `.ds-shell-texture[data-texture='grid'] { background-attachment: scroll, scroll; }`
		});
		const frozen = await shootAcrossScroll(page);
		check(
			'texture: the same probe reports NO movement once attachment is forced back to `scroll`',
			frozen.atRest.equals(frozen.scrolled),
			`control with background-attachment: scroll — identical: ${frozen.atRest.equals(frozen.scrolled)}`
		);
		await context.close();
	}

	// ── It sits behind content, and eats no events ───────────────────────────
	// The sharpest form of "behind": a card with an opaque surface must
	// photograph IDENTICALLY with the texture on and off, while the floor beside
	// it must not. An absolutely positioned `::before` — the shape both surveyed
	// apps reached for first — paints above non-positioned content at `z-index:
	// auto` and would tint the card too, faintly enough that nobody notices by
	// eye and not at all faintly enough to be identical.
	{
		const shootRegions = async (texture) => {
			const { context, page } = await open(`surface=texture&texture=${texture}`);
			await page.waitForSelector('[data-probe="texture-card"]');
			await page.evaluate(() => document.fonts.ready);
			const rect = await page.evaluate(() => {
				const r = document.querySelector('[data-probe="texture-card"]').getBoundingClientRect();
				return { x: r.x, y: r.y, width: r.width, height: r.height };
			});
			const inside = await page.screenshot({
				clip: { x: rect.x + 4, y: rect.y + 4, width: rect.width - 8, height: rect.height - 8 }
			});
			const beside = await page.screenshot({
				clip: { x: rect.x + 4, y: rect.y + rect.height + 20, width: rect.width - 8, height: 120 }
			});
			await context.close();
			return { inside, beside };
		};

		const off = await shootRegions('none');
		const on = await shootRegions('grid');

		check(
			'texture: an opaque card renders identically with the texture on — it is BEHIND content',
			off.inside.equals(on.inside),
			`card interior identical: ${off.inside.equals(on.inside)} (${off.inside.length} vs ${on.inside.length} bytes)`
		);
		check(
			'texture: the floor beside that card does change — the comparison above can see a texture',
			!off.beside.equals(on.beside),
			`floor beside the card identical: ${off.beside.equals(on.beside)}`
		);

		// A background cannot be hit-tested at all, which is what buys
		// `pointer-events: none` for free rather than as a declaration someone has
		// to remember. Asserted at the point that matters: the control the texture
		// runs underneath.
		const { context, page } = await open('surface=texture&texture=grid');
		await page.waitForSelector('[data-probe="texture-button"]');
		const hit = await page.evaluate(() => {
			const button = document.querySelector('[data-probe="texture-button"]');
			const r = button.getBoundingClientRect();
			const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
			const main = document.querySelector('#ds-main');
			const floor = document.elementFromPoint(r.x + 10, r.y + r.height + 80);
			return {
				overButton: el === button || button.contains(el),
				overFloorTag: floor?.tagName.toLowerCase() ?? 'none',
				floorIsInMain: main.contains(floor)
			};
		});
		check(
			'texture: the texture intercepts no pointer events over a control or over bare floor',
			hit.overButton && hit.floorIsInMain,
			`over the button: ${hit.overButton}; over floor hit <${hit.overFloorTag}> inside main: ${hit.floorIsInMain}`
		);
		await context.close();
	}

	// ── It does not print ────────────────────────────────────────────────────
	// A 30px dot grid prints as banding and a vignette as a corner smudge. Both
	// surveyed apps had learned that and written the suppression into their own
	// print rules; the package takes that copy over, so the claim is checked in
	// the media state it is made about rather than by reading the stylesheet.
	{
		const { context, page } = await open('surface=texture&texture=grid');
		await page.waitForSelector('#ds-main');
		const onScreen = await readTexture(page);
		await page.emulateMedia({ media: 'print' });
		const onPaper = await readTexture(page);
		await page.emulateMedia({ media: 'screen' });
		const backOnScreen = await readTexture(page);

		check(
			'texture: on paper the grid and the vignette are suppressed and the region goes white',
			onScreen.backgroundImage !== 'none' &&
				onPaper.backgroundImage === 'none' &&
				onPaper.backgroundColor === 'rgb(255, 255, 255)',
			`screen ${onScreen.backgroundImage.slice(0, 40)}… → print image ${onPaper.backgroundImage}, colour ${onPaper.backgroundColor}`
		);
		check(
			'texture: the print suppression is a media state, not a one-way trip',
			backOnScreen.backgroundImage === onScreen.backgroundImage,
			`restored on screen: ${backOnScreen.backgroundImage === onScreen.backgroundImage}`
		);
		await context.close();
	}

	// ── No scroll-containment or stacking regression ─────────────────────────
	// A texture on a box carrying `overflow-y: auto` is easy to get subtly wrong,
	// and #5 established that this region's sideways scroll is invisible at the
	// document level. So it is measured on the region itself, at the width where
	// it bites, and the drawer — the one thing that must paint OVER the content
	// region — is opened on top of a textured page to prove the paint order is
	// untouched.
	for (const width of [1440, 360]) {
		const { context, page } = await open(`surface=texture&texture=grid`, { width, height: 780 });
		await page.waitForSelector('#ds-main');
		const measured = await readTexture(page);

		check(
			`texture @${width}px: the content region gains no sideways scroll`,
			measured.sideways <= 0,
			`main scrollWidth − clientWidth = ${measured.sideways}px`
		);

		const scrolls = await page.evaluate(() => {
			const main = document.querySelector('#ds-main');
			main.scrollTop = 500;
			const moved = main.scrollTop;
			main.scrollTop = 0;
			return moved;
		});
		check(
			`texture @${width}px: the content region still scrolls under the texture`,
			scrolls === 500,
			`scrollTop settled at ${scrolls} after asking for 500`
		);
		await context.close();
	}
	{
		const { context, page } = await open('surface=texture&texture=grid', {
			width: 360,
			height: 780
		});
		await page.getByTestId('ds-shell-menu').click();
		await page.waitForSelector('[data-testid="ds-shell-drawer"]');
		// The drawer slides in over 200ms (`ds-drawer-in`), and mid-animation it is
		// still translated off-screen — hit-testing it before it lands reports it
		// as missing rather than as behind the texture. The first run of this
		// driver failed here for exactly that reason and not for a paint-order one.
		await page.waitForTimeout(300);
		const overDrawer = await page.evaluate(() => {
			const drawer = document.querySelector('[data-testid="ds-shell-drawer"]');
			const r = drawer.getBoundingClientRect();
			const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
			return drawer.contains(el);
		});
		check(
			'texture: the nav drawer still paints over a textured content region',
			overDrawer,
			`a point inside the open drawer hit-tests inside it: ${overDrawer}`
		);
		await context.close();
	}

	// ── The default, in the browser ──────────────────────────────────────────
	// `surface=shell` names no texture, and since 2026.8.8 that is the shell every
	// consumer gets: the house floor arrives without an app asking for it, at every
	// width. It shipped opt-in and the estate answered by drifting — three apps
	// hand-rolled the same picture in their own app.css — so the default moved.
	for (const width of [2560, 1440, 360]) {
		const { context, page } = await open('surface=shell', { width, height: 900 });
		await page.waitForSelector('#ds-main');
		const bare = await readTexture(page);
		await context.close();

		check(
			`texture @${width}px: a shell that never names texture still paints the house floor`,
			bare.hasClass &&
				bare.attribute === 'grid' &&
				bare.backgroundImage.includes('radial-gradient') &&
				bare.children === 1,
			`class ${bare.hasClass}, attribute ${bare.attribute}, background-image ${bare.backgroundImage}, ${bare.children} child`
		);
	}

	// `none` is the opt-out, and it has to be complete: an app that turns the floor
	// off must land on the region as it was before the feature existed, not on a
	// class with a neutered rule behind it.
	{
		const { context, page } = await open('surface=texture&texture=none');
		await page.waitForSelector('#ds-main');
		const explicit = await readTexture(page);
		await context.close();

		check(
			'texture: texture="none" leaves a genuinely bare region',
			explicit.backgroundImage === 'none' &&
				explicit.attribute === null &&
				!explicit.hasClass &&
				explicit.children === 1,
			`background-image ${explicit.backgroundImage}, attribute ${explicit.attribute}, class ${explicit.hasClass}`
		);
	}
}

// ── The loud-unknown rule, PAINTED ──────────────────────────────────────────
// `src/test/schema-form-loud-unknown.test.ts` proves the flagged fallback is in
// the markup. That is not the same claim as "renders loudly": a block styled
// into invisibility — zero height, a border colour that resolved to nothing,
// tinted with the page's own background — would satisfy every jsdom assertion
// and reproduce the exact defect the component exists to end, which is a field
// that is present in principle and absent on screen. jsdom cannot tell those
// apart: it returns the unresolved `var(--…)` literal and a zero rect for
// everything. So the claim made here is about paint and layout.
{
	const { context, page, errors } = await open('surface=schema-form');
	await page.waitForSelector('[data-probe="schema-form"]');
	await page.addStyleTag({ content: SETTLE });
	await page.addScriptTag({ content: PROBE });

	const flagged = await page.evaluate(() => {
		const nodes = [...document.querySelectorAll('[data-schema-form-unknown]')];
		return nodes.map((node) => {
			const style = getComputedStyle(node);
			const box = node.getBoundingClientRect();
			return {
				reason: node.getAttribute('data-unknown-reason'),
				width: Math.round(box.width),
				height: Math.round(box.height),
				borderColor: style.borderTopColor,
				borderStyle: style.borderTopStyle,
				background: style.backgroundColor,
				// Contrast of the flag's own border against everything behind it: a
				// border the same colour as the page is a border nobody sees.
				borderContrast: window.__probe.contrast(
					window.__probe.composite([...window.__probe.stack(node, false), style.borderTopColor]),
					window.__probe.composite(window.__probe.stack(node, false))
				)
			};
		});
	});

	// The three live defect shapes are all on this surface, on purpose.
	const reasons = flagged.map((entry) => entry.reason).sort();
	check(
		'schema-form: every unrenderable control is flagged in the DOM',
		reasons.join(',') === 'not-in-layout,unknown-element,unknown-widget',
		`reasons ${reasons.join(', ') || '(none)'}`
	);

	check(
		'schema-form: each flag occupies real space on the page',
		flagged.length > 0 && flagged.every((entry) => entry.width > 100 && entry.height > 40),
		flagged.map((entry) => `${entry.reason} ${entry.width}x${entry.height}`).join('; ')
	);

	check(
		'schema-form: each flag paints a resolved, visible warning border',
		flagged.length > 0 &&
			flagged.every(
				(entry) =>
					entry.borderStyle === 'dashed' &&
					!entry.borderColor.includes('var(') &&
					entry.borderContrast >= 1.3
			),
		flagged
			.map((entry) => `${entry.reason} ${entry.borderStyle} ${entry.borderColor} @${entry.borderContrast}:1`)
			.join('; ')
	);

	// A rule that evaluates but changes nothing on screen would make the whole
	// choice of JSON Forms pointless — the 36 conditional-visibility rules in the
	// upstream config models are the reason it was chosen over RJSF.
	const ruled = await page.evaluate(() => ({
		// enabled=true and engine=bedrock, so both SHOW rules hold.
		depth: !!document.querySelector('[data-schema-form-field="tuning.depth"]'),
		endpoint: !!document.querySelector('[data-schema-form-field="tuning.endpoint"]')
	}));
	check(
		'schema-form: both SHOW rules put their fields on the page',
		ruled.depth && ruled.endpoint,
		`depth ${ruled.depth}, endpoint ${ruled.endpoint}`
	);

	// Toggling the value a rule reads must take the whole Group with it.
	await page.getByRole('switch', { name: /Enabled/ }).click();
	await page.waitForTimeout(50);
	const afterToggle = await page.evaluate(
		() => !!document.querySelector('[data-schema-form-field="tuning.depth"]')
	);
	check(
		'schema-form: a Group whose rule stops holding leaves the page',
		afterToggle === false,
		`depth field present after toggle: ${afterToggle}`
	);

	check('schema-form: renders with no page errors', errors.length === 0, errors.join(' | ') || 'none');
	await context.close();
}

// ── The library surfaces (#30) ──────────────────────────────────────────────
// browse → document → collection, driven the way a user drives it. jsdom can
// fire every one of these handlers; what it cannot do is show that a legible
// detail surface actually LANDS — real paint, resolved type faces, a facet
// press whose chip visibly appears — and it has no layout with which to answer
// whether the catalogue table pushes sideways scroll into the shell at 375px.
{
	const { context, page, errors } = await open('surface=library');
	await page.waitForSelector('[data-probe="library-browse"] table');

	const rows = await page.evaluate(
		() => document.querySelectorAll('[data-probe="library-browse"] tbody tr').length
	);
	check('library: the catalogue renders a row per document', rows === 3, `${rows} rows`);

	// A facet press is only a callback; the page re-rendering with the
	// selection — pressed option, visible chip — is the proof the loop closed.
	await page.getByRole('button', { name: 'property 2' }).click();
	let chipVisible = true;
	try {
		await page.getByText('tags: property', { exact: true }).waitFor({ state: 'visible', timeout: 4000 });
	} catch {
		chipVisible = false;
	}
	check('library: a facet press comes back as a visible filter chip', chipVisible, chipVisible ? 'chip visible' : 'never appeared');
	const pressed = await page.evaluate(() => {
		const buttons = [...document.querySelectorAll('[aria-pressed="true"]')];
		return buttons.map((b) => b.textContent.trim().replace(/\s+/g, ' '));
	});
	check(
		'library: the pressed option is marked pressed',
		pressed.some((t) => t.startsWith('property')),
		JSON.stringify(pressed)
	);

	// Browse to detail — the interaction #30 requires driven, not rendered.
	await page.getByRole('button', { name: 'Trust deed — Rivers Family Trust, deed of variation' }).click();
	await page.waitForSelector('[data-probe="library-document"]');
	const docMeasured = await page.evaluate(() => {
		const root = document.querySelector('[data-probe="library-document"]');
		const title = root.querySelector('h2');
		const hash = [...root.querySelectorAll('dd')].find((dd) =>
			dd.textContent.includes('a3f81c92d4e5b60718aa')
		);
		const box = root.getBoundingClientRect();
		return {
			title: title?.textContent.trim(),
			titleFont: title ? getComputedStyle(title).fontFamily : null,
			hashFont: hash ? getComputedStyle(hash).fontFamily : null,
			width: Math.round(box.width),
			height: Math.round(box.height)
		};
	});
	check(
		'library: clicking a catalogue row lands the document detail, painted',
		docMeasured.title === 'Trust deed — Rivers Family Trust, deed of variation' &&
			docMeasured.width > 300 &&
			docMeasured.height > 100,
		`"${docMeasured.title}" at ${docMeasured.width}x${docMeasured.height}`
	);
	// The name-shaped title resolves the display face, and the machine value
	// the code face — resolved families, not class names (#9's lesson).
	check(
		'library: the document title resolves the display family',
		docMeasured.titleFont?.includes('Fraunces'),
		docMeasured.titleFont
	);
	check(
		'library: the content hash resolves the mono family',
		docMeasured.hashFont?.includes('JetBrains Mono'),
		docMeasured.hashFont
	);

	// One hop further: a membership press lands the collection detail.
	await page.getByRole('button', { name: /household-legal/ }).click();
	await page.waitForSelector('[data-probe="library-collection"]');
	const colMeasured = await page.evaluate(() => {
		const root = document.querySelector('[data-probe="library-collection"]');
		return {
			title: root.querySelector('h2')?.textContent.trim(),
			rows: root.querySelectorAll('tbody tr').length,
			statValue: [...root.querySelectorAll('dd')].some((dd) => dd.textContent.trim() === '3')
		};
	});
	check(
		'library: a membership press lands the collection detail with its documents',
		colMeasured.title === 'household-legal' && colMeasured.rows === 3 && colMeasured.statValue,
		JSON.stringify(colMeasured)
	);

	check('library: no page error across the whole flow', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// The catalogue at phone width: the table must scroll inside its own
// container, never widen the shell's content region — #5's exact blindness,
// measured on this surface because the browse grid's min-w-0 is the only
// thing standing between the two.
{
	const { context, page } = await open('surface=library', { width: 375, height: 800 });
	await page.waitForSelector('[data-probe="library-browse"] table');
	const measured = await page.evaluate(() => {
		const main = document.querySelector('#ds-main');
		const scroller = document.querySelector('[data-slot="table-container"]');
		return {
			mainScroll: main.scrollWidth,
			mainClient: main.clientWidth,
			tableScroll: scroller?.scrollWidth ?? 0,
			tableClient: scroller?.clientWidth ?? 0
		};
	});
	check(
		'library @ 375px: the content region does not scroll sideways',
		measured.mainScroll <= measured.mainClient,
		`main scrollWidth ${measured.mainScroll} vs clientWidth ${measured.mainClient} (+${measured.mainScroll - measured.mainClient}px)`
	);
	// Recorded, not gated: whether the fixture table is wider than a phone is a
	// fixture fact, but when it is, the excess must be inside the scroller.
	checks.push({
		name: 'library @ 375px: the table scroller (recorded)',
		ok: true,
		detail: `table scrollWidth ${measured.tableScroll} vs clientWidth ${measured.tableClient}`
	});
	await context.close();
}

// ── SearchResults, designed not extracted (#30) ─────────────────────────────
// The highlight is the component's whole reason to exist, and "renders a
// tint" is a paint claim: a <mark> whose colour resolved to nothing, or to
// the page's own background, satisfies every jsdom assertion and highlights
// nothing — SchemaForm's silent-fallback defect wearing a different mask. And
// the acceptance's "under a consumer's own tokens" is measured here: the
// sanctioned accent knob is turned, and the painted pixel must move.
{
	const { context, page, errors } = await open('surface=search-results');
	await page.waitForSelector('[data-probe="search-results"] mark');
	await page.addStyleTag({ content: SETTLE });
	await page.addScriptTag({ content: PROBE });

	const before = await page.evaluate(() => {
		const { composite, stack } = window.__probe;
		const mark = document.querySelector('mark');
		const box = mark.getBoundingClientRect();
		const style = getComputedStyle(mark);
		const behind = composite(stack(mark, false));
		const painted = composite([...stack(mark, false), style.backgroundColor]);
		const score = [...document.querySelectorAll('[data-probe="search-results"] span')].find(
			(el) => el.textContent.trim() === '92%'
		);
		return {
			width: Math.round(box.width),
			height: Math.round(box.height),
			background: style.backgroundColor,
			moved: JSON.stringify(painted) !== JSON.stringify(behind),
			painted: painted.map((c) => Math.round(c * 255)),
			scoreFont: score ? getComputedStyle(score).fontFamily : null,
			scoreNumeric: score ? getComputedStyle(score).fontVariantNumeric : null
		};
	});
	check(
		'search-results: the highlight occupies real space',
		before.width > 10 && before.height > 10,
		`${before.width}x${before.height}`
	);
	check(
		'search-results: the highlight paints a resolved tint distinct from its ground',
		!before.background.includes('var(') && before.moved,
		`background ${before.background}, painted rgb(${before.painted.join(' ')})`
	);
	check(
		'search-results: the relevance figure resolves mono with tabular numerals',
		Boolean(before.scoreFont?.includes('JetBrains Mono')) &&
			Boolean(before.scoreNumeric?.includes('tabular-nums')),
		`${before.scoreFont} / ${before.scoreNumeric}`
	);

	// The consumer's one sanctioned personality knob, turned the way an app
	// turns it. The highlight must follow it — proof no colour is baked in.
	await page.addStyleTag({
		content: ':root { --ds-color-primary: oklch(0.62 0.18 250); }'
	});
	const after = await page.evaluate(() => {
		const { composite, stack } = window.__probe;
		const mark = document.querySelector('mark');
		return composite([...stack(mark, false), getComputedStyle(mark).backgroundColor]).map((c) =>
			Math.round(c * 255)
		);
	});
	check(
		"search-results: the highlight follows the consumer's own accent",
		JSON.stringify(after) !== JSON.stringify(before.painted),
		`rgb(${before.painted.join(' ')}) -> rgb(${after.join(' ')})`
	);

	check('search-results: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── The prose face for HTML the app never authored (#32) ────────────────────
// A compiled-CSS gate proves the rules exist; only an engine proves they REACH
// content the app did not write, which is the whole case — three consumers had
// each built one of these and typography degrades worst when re-derived.
{
	const { context, page } = await open('surface=measure&measure=wide', {
		width: 2560,
		height: 1440
	});
	await page.waitForSelector('[data-probe="prose"]');
	await page.addStyleTag({ content: SETTLE });
	await page.evaluate(() => document.fonts.ready);

	const prose = await page.evaluate(() => {
		const read = (probe) => document.querySelector(`[data-probe="${probe}"]`);
		const table = read('prose-table');
		return {
			headingFamily: getComputedStyle(read('prose-h2')).fontFamily,
			bodyFamily: getComputedStyle(read('prose')).fontFamily,
			codeFamily: getComputedStyle(read('prose-code')).fontFamily,
			listStyle: getComputedStyle(read('prose-list')).listStyleType,
			quoteBorder: getComputedStyle(read('prose-quote')).borderInlineStartWidth,
			linkColour: getComputedStyle(read('prose-link')).color,
			tableScrolls: table.scrollWidth > table.clientWidth,
			tableOverflowX: getComputedStyle(table).overflowX,
			// The claim that matters most: a wide table must not take the PAGE
			// sideways with it.
			pageSideways: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});

	check(
		'prose: a heading in rendered content resolves the display face',
		prose.headingFamily.includes('Fraunces') && prose.headingFamily !== prose.bodyFamily,
		`heading ${prose.headingFamily}`
	);
	check(
		'prose: inline code resolves the code face',
		prose.codeFamily.includes('JetBrains Mono'),
		prose.codeFamily
	);
	check(
		'prose: a list keeps its marker despite the preflight reset',
		prose.listStyle === 'disc',
		`list-style-type ${prose.listStyle}`
	);
	check(
		'prose: a blockquote takes a real rule and a link takes the accent',
		parseFloat(prose.quoteBorder) >= 2 && prose.linkColour !== 'rgb(0, 0, 238)',
		`quote rule ${prose.quoteBorder}, link ${prose.linkColour}`
	);
	check(
		'prose: a table wider than the measure scrolls in its own box',
		prose.tableScrolls && prose.tableOverflowX === 'auto',
		`table scrollWidth > clientWidth: ${prose.tableScrolls}, overflow-x ${prose.tableOverflowX}`
	);
	check(
		'prose: and does not take the page sideways with it',
		prose.pageSideways === 0,
		`document gained ${prose.pageSideways}px of sideways scroll`
	);
	await context.close();
}

// ── The keyboard focus indicator on Button (#18) ────────────────────────────
// Reported as "the box-shadow never renders, regardless of ring colour". It
// does render. The report was a measurement artefact, and an instructive one:
// Button's base carries `transition-all` at 150ms, so a `getComputedStyle` read
// taken in the same turn as the focus returns the transition's START value —
// a fully transparent shadow and a transparent border-top-color, which is
// exactly the symptom described, and which no change to the ring COLOUR can
// move. That is why swapping the ring colour "had no effect".
//
// The suggested guard is kept anyway, because it is the right one and its
// absence is what let an afternoon go into this: assert the COMPUTED box-shadow
// on a genuinely Tab-focused button, not the custom property. A test on
// `--tw-ring-shadow` passes whether or not anything is painted.
{
	const { context, page } = await open('surface=palette');
	await page.waitForSelector('[data-probe="button-default-default"]');

	// A real keyboard traversal. `.focus()` does not reliably set the keyboard
	// modality, so `:focus-visible` can fail to match and give a false negative.
	await page.keyboard.press('Tab');
	let reached = false;
	for (let hop = 0; hop < 400 && !reached; hop += 1) {
		reached = await page.evaluate(
			() => document.activeElement?.getAttribute('data-probe') === 'button-default-default'
		);
		if (!reached) await page.keyboard.press('Tab');
	}
	// Deliberately not SETTLE-d, and deliberately waited out: the transition is
	// the thing that produced the false report, so this check has to live with it
	// rather than switch it off.
	await page.waitForTimeout(400);

	const focus = await page.evaluate(() => {
		const el = document.activeElement;
		const style = getComputedStyle(el);
		return {
			probe: el?.getAttribute('data-probe'),
			focusVisible: el.matches(':focus-visible'),
			boxShadow: style.boxShadow,
			borderTopColor: style.borderTopColor,
			// The property a naive test would have asserted on. Reported, never
			// asserted, so the difference between the two stays visible here.
			ringShadowProperty: style.getPropertyValue('--tw-ring-shadow').trim()
		};
	});

	check(
		'button focus: real Tab navigation matches :focus-visible',
		focus.probe === 'button-default-default' && focus.focusVisible,
		`focus on ${focus.probe}, :focus-visible ${focus.focusVisible}`
	);
	// The claim, and it is about the COMPUTED shadow: at least one layer with a
	// non-zero spread and a colour that is not fully transparent.
	const painted = /(?:rgba?|oklab|oklch)\([^)]*\)\s+0px 0px 0px [1-9]/.test(focus.boxShadow);
	const transparent = /\/\s*0\)/.test(focus.boxShadow.split(',').find((l) => /[1-9]px/.test(l)) ?? '');
	check(
		'button focus: the computed box-shadow actually paints a ring',
		painted && !transparent,
		focus.boxShadow
	);
	check(
		'button focus: the border takes the ring colour too',
		!/\/\s*0\)|rgba\(0, 0, 0, 0\)/.test(focus.borderTopColor),
		`border-top-color ${focus.borderTopColor} (--tw-ring-shadow resolved to "${focus.ringShadowProperty}", which is what a property-based test would have asserted on — it reads correct even when nothing is painted)`
	);
	await context.close();
}

// ── A clickable card's hover affordance (#24) ───────────────────────────────
// The defect this gates compiles, type-checks, passes every structural test and
// satisfies every contrast check on text. It is wrong only when a human moves a
// mouse, because `--color-accent` and `--color-card` resolved to the same rung,
// so `hover:bg-accent/50` mixed a colour at 50% over a ground identical to it.
//
// A rest-state screenshot cannot catch that, and neither can a test asserting on
// the class list or on the custom property. This drives a real pointer and
// compares two RESOLVED, COMPOSITED colours — the only comparison that can fail
// when the two happen to be the same value.
for (const scheme of ['light', 'dark']) {
	const { context, page, errors } = await open(
		'surface=palette',
		{ width: 1440, height: 900 },
		scheme
	);
	await page.waitForSelector('[data-probe="card-interactive"]');
	// Deliberately NOT settled. `transition: none` is the right instrument
	// everywhere else, but a hover fill that only ever exists mid-transition
	// would then read as painted; each state is allowed to land on its own.
	await page.addScriptTag({ content: PROBE });

	const card = page.locator('[data-probe="card-interactive"]');
	const paint = () =>
		page.evaluate(() => {
			const el = document.querySelector('[data-probe="card-interactive"]');
			const { composite, stack } = window.__probe;
			// Composite the element's own fill over everything behind it: a hover
			// fill is usually translucent, so the declared value is not the colour
			// a reader sees.
			return composite([...stack(el, false), getComputedStyle(el).backgroundColor]).map((c) =>
				Math.round(c * 255)
			);
		});

	await page.mouse.move(5, 5);
	await page.waitForTimeout(250);
	const rest = await paint();
	await card.hover();
	await page.waitForTimeout(250);
	const hover = await paint();

	const distance = Math.max(...rest.map((c, i) => Math.abs(c - hover[i])));
	check(
		`card hover (${scheme}): the hovered fill is not the resting fill`,
		JSON.stringify(rest) !== JSON.stringify(hover),
		`rest rgb(${rest.join(' ')}) -> hover rgb(${hover.join(' ')})`
	);
	// Distinct-but-imperceptible is the failure mode one rung up from the original
	// defect, and a strict inequality would sail straight past it.
	check(
		`card hover (${scheme}): the difference is big enough to see`,
		distance >= 4,
		`largest channel shift ${distance}/255`
	);
	// The check that actually pins the FIX rather than the symptom, and it exists
	// because the first version of this gate passed against the broken build.
	// Once the ladder lifted the card off the page, `bg-accent/50` differed from
	// rest for the wrong reason — 50% alpha over a card whose fill equalled the
	// accent simply let the PAGE show through, so the card faded toward the page
	// on hover instead of taking a tint. Distinctness alone cannot tell those
	// apart. Retuning the app's accent can: a hover fill that is really the
	// accent moves with it, and a surface rung wearing the accent's name does not.
	await page.addStyleTag({
		content: ':root, .dark { --ds-color-primary: oklch(0.62 0.24 25) !important; }'
	});
	await page.waitForTimeout(250);
	const retuned = await paint();
	check(
		`card hover (${scheme}): the hover fill follows the app's own accent`,
		JSON.stringify(retuned) !== JSON.stringify(hover),
		`hover rgb(${hover.join(' ')}) -> rgb(${retuned.join(' ')}) once --ds-color-primary is retuned`
	);

	check(`card hover (${scheme}): no page error`, errors.length === 0, JSON.stringify(errors));
	await context.close();
}


// ── The control density ramp (the fork this package was losing to) ──────────
// Button's heights were hard-coded Tailwind classes, so no token could reach
// them: an app whose controls run at 28-32px could not adopt this package's
// Button without every one of its rows growing, and it forked six directories
// rather than take that. The ramp is `--ds-control-*` tokens now, moved as a
// set by `data-ds-density` on any ancestor.
//
// Two claims, and the second is the one that protects every existing consumer:
// the compact preset moves every rung, and the DEFAULT is the previous scale to
// the pixel. The comfortable numbers below are transcribed from the classes
// this change deleted (h-10 is 40, px-4 is 16, pr-3 is 12) — so a "tidy-up" of
// the ramp fails here rather than in somebody's app.
//
// Only an engine can make either claim: the value is a var() chain, and jsdom
// hands back the literal `var(--ds-control-height-md)` for every one of them.
{
	const RAMP = {
		comfortable: {
			xs: { height: 28, pad: 10, trim: 6 },
			sm: { height: 36, pad: 14, trim: 8 },
			default: { height: 40, pad: 16, trim: 12 },
			lg: { height: 44, pad: 20, trim: 12 }
		},
		compact: {
			xs: { height: 24, pad: 8, trim: 4 },
			sm: { height: 28, pad: 10, trim: 6 },
			default: { height: 32, pad: 12, trim: 8 },
			lg: { height: 36, pad: 16, trim: 10 }
		}
	};
	const ICON_OF = { xs: 'icon-xs', sm: 'icon-sm', default: 'icon', lg: 'icon-lg' };

	for (const [density, rungs] of Object.entries(RAMP)) {
		const query =
			density === 'comfortable' ? 'surface=palette' : `surface=palette&density=${density}`;
		const { context, page, errors } = await open(query);
		await page.waitForSelector('[data-probe="buttons"]');
		await page.addStyleTag({ content: SETTLE });

		const measured = await page.evaluate(() => {
			const read = (probe) => {
				const el = document.querySelector(`[data-probe="${probe}"]`);
				if (!el) return null;
				const style = getComputedStyle(el);
				return {
					height: Math.round(el.getBoundingClientRect().height),
					padStart: Math.round(parseFloat(style.paddingInlineStart)),
					padEnd: Math.round(parseFloat(style.paddingInlineEnd)),
					width: Math.round(el.getBoundingClientRect().width)
				};
			};
			const out = {};
			for (const probe of document.querySelectorAll('[data-probe^="button-"]')) {
				out[probe.getAttribute('data-probe')] = read(probe.getAttribute('data-probe'));
			}
			out.__input = read('input');
			return out;
		});

		for (const [rung, want] of Object.entries(rungs)) {
			const text = measured[`button-default-${rung}`];
			check(
				`density ${density}: a ${rung} button is ${want.height}px tall`,
				text?.height === want.height,
				`${text?.height}px`
			);
			check(
				`density ${density}: a ${rung} button pads ${want.pad}px inline`,
				text?.padStart === want.pad && text?.padEnd === want.pad,
				`${text?.padStart}/${text?.padEnd}px`
			);
			// The rung that goes wrong quietly. A preset that moves the side padding
			// and leaves the icon trim behind gives an icon MORE room than a word,
			// which reads as a broken button rather than as a density.
			const withIcon = measured[`button-icon-inline-end-${rung}`];
			check(
				`density ${density}: a ${rung} button trims to ${want.trim}px beside an icon`,
				withIcon?.padEnd === want.trim,
				`${withIcon?.padEnd}px (leading edge ${withIcon?.padStart}px)`
			);
			// An icon button is a square of the same height, so an icon button and a
			// text button in one row cannot disagree about how tall a control is.
			const icon = measured[`button-${ICON_OF[rung]}`];
			check(
				`density ${density}: the ${ICON_OF[rung]} button is a ${want.height}px square`,
				icon?.height === want.height && icon?.width === want.height,
				`${icon?.width}x${icon?.height}px`
			);
		}

		// The knob is Button's, and only Button's. Input never read these tokens
		// and must not start moving with them — if it did, "compact" would be a
		// second, undeclared design rather than a density.
		check(
			`density ${density}: the text input stays at its own 32px`,
			measured.__input?.height === 32,
			`${measured.__input?.height}px`
		);
		check(`density ${density}: no page error`, errors.length === 0, JSON.stringify(errors));
		await context.close();
	}

	// Why the compact numbers are those numbers rather than picked ones: at
	// `compact`, a default Button and an Input are the same height. That is the
	// alignment the forking app was hand-pinning on 75 call sites.
	{
		const { context, page } = await open('surface=palette&density=compact');
		await page.waitForSelector('[data-probe="buttons"]');
		const pair = await page.evaluate(() => {
			const h = (probe) =>
				Math.round(
					document.querySelector(`[data-probe="${probe}"]`).getBoundingClientRect().height
				);
			return { button: h('button-default-default'), input: h('input') };
		});
		check(
			'density compact: a default button and a text input are the same height',
			pair.button === pair.input,
			`button ${pair.button}px, input ${pair.input}px`
		);
		await context.close();
	}

	// Scoped density. The rules declare on the element carrying the attribute
	// rather than at :root, so a subtree can differ from its page — and an app
	// that has gone compact can still render one ordinary control row. A cascade
	// fact, so it needs an engine: nothing about the markup says which won.
	{
		const { context, page } = await open('surface=palette&density=compact');
		// The button animates its height (`transition-all`), which raced the wait
		// below: 39px at 200ms on a loaded runner. The fact is a cascade one, so
		// the transition goes, as SETTLE says, rather than being waited out.
		await page.addStyleTag({ content: SETTLE });
		await page.waitForSelector('[data-probe="buttons"]');
		const before = await page.evaluate(() =>
			Math.round(
				document.querySelector('[data-probe="button-default-default"]').getBoundingClientRect()
					.height
			)
		);
		await page.evaluate(() => {
			document
				.querySelector('[data-probe="buttons"]')
				.setAttribute('data-ds-density', 'comfortable');
		});
		// Deliberately a separate turn, and the reason is worth carrying: reading
		// the box in the SAME task as the attribute write returns the old height
		// while `getPropertyValue` already returns the new token — 2.5rem on the
		// element, 32px in the layout. It reads exactly like a dead knob, and it
		// is the measurement trap this file keeps rediscovering in a new costume
		// (see SETTLE above, and the #18 focus-ring note below).
		await page.waitForTimeout(200);
		const after = await page.evaluate(() =>
			Math.round(
				document.querySelector('[data-probe="button-default-default"]').getBoundingClientRect()
					.height
			)
		);
		check(
			'density: a comfortable subtree inside a compact page returns to 40px',
			before === 32 && after === 40,
			`${before}px -> ${after}px`
		);
		await context.close();
	}
}

// ── The data-state values that were never mapped (checked, active) ──────────
// `data-checked:` compiled to `&[data-checked]`, and bits-ui emits
// `data-state="checked"`. So every checked checkbox in a consuming app painted
// no fill — grey border, dark tick on a transparent ground — and every tab strip
// rendered its selected trigger identically to the rest. Nine checkboxes on one
// route, eleven routes of tabs, months in production, because the class was in
// the DOM the whole time and only the rule was missing.
//
// Distinctness alone is not the claim, for the same reason it was not enough for
// the card hover (#24): two things can differ for the wrong reason. Each state
// is also retuned against `--ds-color-primary`, which a real primary fill
// follows and a coincidence does not.
for (const scheme of ['light', 'dark']) {
	const { context, page, errors } = await open(
		'surface=palette',
		{ width: 1440, height: 900 },
		scheme
	);
	await page.waitForSelector('[data-probe="checkbox"]');
	await page.addStyleTag({ content: SETTLE });
	await page.addScriptTag({ content: PROBE });

	const fills = () =>
		page.evaluate(() => {
			const { composite, stack } = window.__probe;
			const paint = (probe) => {
				const el = document.querySelector(`[data-probe="${probe}"]`);
				return composite([...stack(el, false), getComputedStyle(el).backgroundColor]).map((c) =>
					Math.round(c * 255)
				);
			};
			return {
				checked: paint('checkbox'),
				unchecked: paint('checkbox-unchecked'),
				indeterminate: paint('checkbox-indeterminate'),
				tabActive: paint('tab-active'),
				tabInactive: paint('tab-inactive')
			};
		});

	const rest = await fills();
	const apart = (a, b) => Math.max(...a.map((c, i) => Math.abs(c - b[i])));

	check(
		`checkbox (${scheme}): a checked box does not paint the same as an unchecked one`,
		apart(rest.checked, rest.unchecked) >= 16,
		`checked rgb(${rest.checked.join(' ')}) vs unchecked rgb(${rest.unchecked.join(' ')})`
	);
	check(
		`checkbox (${scheme}): an indeterminate box paints the same fill as a checked one`,
		JSON.stringify(rest.indeterminate) === JSON.stringify(rest.checked),
		`indeterminate rgb(${rest.indeterminate.join(' ')}) vs checked rgb(${rest.checked.join(' ')})`
	);
	check(
		`tabs (${scheme}): the selected trigger does not paint the same as an unselected one`,
		apart(rest.tabActive, rest.tabInactive) >= 8,
		`active rgb(${rest.tabActive.join(' ')}) vs inactive rgb(${rest.tabInactive.join(' ')})`
	);

	// The check that pins the FIX rather than the symptom: a fill that is really
	// the app's primary moves when the app's primary moves.
	await page.addStyleTag({
		content: ':root, .dark { --ds-color-primary: oklch(0.62 0.24 25) !important; }'
	});
	const retuned = await fills();
	check(
		`checkbox (${scheme}): the checked fill follows the app's own accent`,
		JSON.stringify(retuned.checked) !== JSON.stringify(rest.checked),
		`rgb(${rest.checked.join(' ')}) -> rgb(${retuned.checked.join(' ')})`
	);
	check(`checkbox (${scheme}): no page error`, errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── The pointer target on a 16px control ────────────────────────────────────
// WCAG 2.5.8 asks for 24x24. A checkbox is 16 and a switch track is 20, and
// neither is going to grow — the tick has to sit where a reader expects it and
// the row's rhythm is built around the painted size. The answer is a
// transparent `::after` skirt, and the only honest test of it is hit-testing: a
// class assertion cannot tell a skirt that paints from one that receives a
// click, and `getBoundingClientRect` cannot see a pseudo-element at all.
//
// The target is MEASURED rather than probed at a chosen offset. The first
// version of this check hit-tested at ±14px and reported the switch as failing;
// the skirt is inset from the PADDING box, so a `border-2` track's real reach is
// 4px outside its border box, and ±14 was landing exactly on the boundary. A
// number someone picks is a number that can be wrong about the thing it is
// measuring — so this walks outward a pixel at a time and reports what it finds.
{
	const { context, page } = await open('surface=palette');
	await page.waitForSelector('[data-probe="checkbox"]');

	const probed = await page.evaluate(() => {
		// `elementFromPoint` returns null outside the viewport, and null is
		// indistinguishable from "nothing there", so every control is scrolled to
		// the middle before it is walked.
		const measure = (probe) => {
			const el = document.querySelector(`[data-probe="${probe}"]`);
			el.scrollIntoView({ block: 'center', inline: 'center' });
			const r = el.getBoundingClientRect();
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;
			const hits = (x, y) => {
				const at = document.elementFromPoint(x, y);
				return at !== null && (at === el || el.contains(at));
			};
			const reach = (dx, dy) => {
				let k = 0;
				while (k < 60 && hits(cx + dx * (k + 1), cy + dy * (k + 1))) k += 1;
				return k;
			};
			return {
				painted: [Math.round(r.width), Math.round(r.height)],
				target: [reach(-1, 0) + reach(1, 0), reach(0, -1) + reach(0, 1)]
			};
		};
		return { checkbox: measure('checkbox'), switch: measure('switch') };
	});

	// The painted size is half the claim: a skirt that worked by growing the
	// control would have solved the wrong problem.
	check(
		'checkbox: the painted control is still 16px',
		JSON.stringify(probed.checkbox.painted) === '[16,16]',
		`${probed.checkbox.painted.join('x')}px`
	);
	check(
		'checkbox: the pointer target clears the 24px minimum on both axes',
		probed.checkbox.target[0] >= 24 && probed.checkbox.target[1] >= 24,
		`target ${probed.checkbox.target.join('x')}px around a ${probed.checkbox.painted.join('x')}px control`
	);
	check(
		'switch: the painted track is still 36x20px',
		JSON.stringify(probed.switch.painted) === '[36,20]',
		`${probed.switch.painted.join('x')}px`
	);
	// The switch grows on the block axis only — it is already 36px wide, and an
	// inline skirt would reach into the label beside it.
	check(
		'switch: the pointer target clears 24px on the block axis',
		probed.switch.target[1] >= 24,
		`target ${probed.switch.target.join('x')}px around a ${probed.switch.painted.join('x')}px track`
	);
	await context.close();
}

// ── The dropdown menu's edge, and the --bits-* variables ────────────────────
// `border-[--border-strong]` compiles — to `border-color: --border-strong`,
// which is not a colour. The declaration is dropped and the border falls back to
// `currentColor`, so a dropdown menu drew its edge in whatever ink its text
// happened to be. Nothing reports it: the class is in the DOM and a rule exists.
// The only reading that can fail is the RESOLVED border colour, against the
// resolved ink it would have taken.
//
// The `--bits-*` variables ride along here for the same reason. They are the
// popover's documented height cap and zoom origin, and a name bits-ui does not
// set makes the whole declaration invalid at computed-value time — the cap
// simply does not apply, silently. `theme-coverage.test.ts` now derives the
// valid names from node_modules; this is where they are shown to RESOLVE.
{
	const { context, page } = await open('surface=long-lists');
	await page.getByText('Open menu', { exact: true }).click();
	await page.waitForSelector('[data-slot="dropdown-menu-content"]');
	await page.addStyleTag({ content: SETTLE });

	const menu = await page.evaluate(() => {
		const el = document.querySelector('[data-slot="dropdown-menu-content"]');
		const style = getComputedStyle(el);
		const probe = document.createElement('div');
		probe.style.color = 'var(--ds-color-border-strong)';
		el.appendChild(probe);
		const wanted = getComputedStyle(probe).color;
		probe.remove();
		return {
			borderTopColor: style.borderTopColor,
			ink: style.color,
			wanted,
			maxHeight: style.maxHeight
		};
	});

	check(
		'dropdown menu: the border is not currentColor',
		menu.borderTopColor !== menu.ink,
		`border ${menu.borderTopColor}, ink ${menu.ink}`
	);
	check(
		'dropdown menu: the border resolves to --ds-color-border-strong',
		menu.borderTopColor === menu.wanted,
		`border ${menu.borderTopColor}, token ${menu.wanted}`
	);
	// A `max-height` of `none` is exactly what an unset `--bits-*` name produces,
	// and it is what let a long menu run off the bottom of the window.
	check(
		'dropdown menu: --bits-dropdown-menu-content-available-height resolves to a length',
		/^[0-9.]+px$/.test(menu.maxHeight),
		`max-height: ${menu.maxHeight}`
	);
	await context.close();
}

{
	const { context, page } = await open('surface=long-lists');
	await page.getByText('Open popover', { exact: true }).click();
	await page.waitForSelector('[data-slot="popover-content"]');
	await page.addStyleTag({ content: SETTLE });

	const popover = await page.evaluate(() => {
		const el = document.querySelector('[data-slot="popover-content"]');
		const style = getComputedStyle(el);
		return {
			maxHeight: style.maxHeight,
			transformOrigin: style.transformOrigin,
			available: style.getPropertyValue('--bits-popover-content-available-height').trim(),
			origin: style.getPropertyValue('--bits-popover-content-transform-origin').trim()
		};
	});

	check(
		'popover: --bits-popover-content-available-height resolves to a length',
		/^[0-9.]+px$/.test(popover.available) && /^[0-9.]+px$/.test(popover.maxHeight),
		`variable ${popover.available || '(empty)'}, max-height ${popover.maxHeight}`
	);
	// The origin is what makes the zoom grow out of the trigger rather than out
	// of the box centre. bits-ui writes it as a pair of lengths; an unset name
	// leaves the property at its 50% 50% default.
	check(
		'popover: --bits-popover-content-transform-origin resolves to a real origin',
		popover.origin.length > 0 && !/^(?:50% 50%|)$/.test(popover.origin),
		`variable "${popover.origin}", computed transform-origin ${popover.transformOrigin}`
	);
	await context.close();
}

// ---------------------------------------------------------------------------
// The settings destination (#39).
//
// Every claim here is a layout fact, which is exactly why it is not in
// src/test/: whether the section list is really 240px, whether the two panes
// scroll INDEPENDENTLY (`overflow-y: auto` does nothing unless a height bounds
// the box, and jsdom reports every scrollHeight as 0 either way), whether the
// pane's text lands on the same rhythm as an ordinary page's, and whether the
// same markup stacks below md instead of crushing the content into a sliver.
// ---------------------------------------------------------------------------
{
	const { context, page, errors } = await open('surface=settings', { width: 1440, height: 900 });
	await page.waitForSelector('.ds-settings-pane');
	await page.addStyleTag({ content: SETTLE });

	const desktop = await page.evaluate(() => {
		const list = document.querySelector('.ds-settings > nav');
		const pane = document.querySelector('.ds-settings-pane');
		const active = document.querySelector('.ds-settings a[aria-current="page"]');
		return {
			listWidth: list.getBoundingClientRect().width,
			listOverflowY: getComputedStyle(list).overflowY,
			listScrolls: list.scrollHeight > list.clientHeight,
			paneOverflowY: getComputedStyle(pane).overflowY,
			paneScrolls: pane.scrollHeight > pane.clientHeight,
			// Side by side, not stacked: the pane's top is the list's top.
			stacked: pane.getBoundingClientRect().top > list.getBoundingClientRect().top + 1,
			// The rule is on the inline-end edge, where a left-to-right reader
			// expects it, and it is a real resolved width rather than a class that
			// compiled to nothing.
			listBorderInlineEnd: getComputedStyle(list).borderInlineEndWidth,
			listBorderBottom: getComputedStyle(list).borderBottomWidth,
			// A tint, not transparent: the two panes have to read as two surfaces.
			listBackground: getComputedStyle(list).backgroundColor,
			activeIndicatorWidth: active
				? getComputedStyle(active.querySelector('.ds-nav-indicator')).width
				: null,
			// The one row that says which section you are in.
			activeCount: document.querySelectorAll('.ds-settings a[aria-current="page"]').length,
			// The personal group is present in the data and EMPTY; it must not
			// render an eyebrow with nothing under it.
			headings: [...document.querySelectorAll('.ds-settings .ds-nav-heading')].map((h) =>
				h.textContent.trim()
			)
		};
	});

	check(
		'settings: the section list is 240px wide at 1440',
		Math.round(desktop.listWidth) === 240,
		`${desktop.listWidth.toFixed(1)}px`
	);
	check(
		'settings: the two panes are side by side, not stacked',
		!desktop.stacked,
		desktop.stacked ? 'the pane starts below the list' : 'same top edge'
	);
	// The pair that matters: BOTH boxes are their own scroller, so a long
	// settings page cannot push the section list out of reach. The list is short
	// here, so its own claim is that it CAN scroll, not that it does.
	check(
		'settings: each pane is its own scroller, and the content pane is actually scrolling',
		desktop.listOverflowY === 'auto' && desktop.paneOverflowY === 'auto' && desktop.paneScrolls,
		`list ${desktop.listOverflowY}, pane ${desktop.paneOverflowY}, pane scrollable ${desktop.paneScrolls}`
	);
	check(
		'settings: the list carries an inline-end rule and no bottom rule',
		parseFloat(desktop.listBorderInlineEnd) > 0 &&
			parseFloat(desktop.listBorderBottom) === 0,
		`inline-end ${desktop.listBorderInlineEnd}, bottom ${desktop.listBorderBottom}`
	);
	check(
		'settings: the list sits on its own tint rather than the page background',
		desktop.listBackground !== 'rgba(0, 0, 0, 0)' && desktop.listBackground !== 'transparent',
		desktop.listBackground
	);
	// Colour alone never carries the active state (WCAG 1.4.1). The edge bar is
	// the rail's own element, so this also proves the list is AppNav rather than
	// a hand-rolled copy that forgot it.
	check(
		'settings: exactly one row is the page, and it carries the rail edge bar',
		desktop.activeCount === 1 && parseFloat(desktop.activeIndicatorWidth) > 0,
		`${desktop.activeCount} current row(s), indicator ${desktop.activeIndicatorWidth}`
	);
	check(
		'settings: an empty group renders no eyebrow',
		!desktop.headings.includes('Yours') &&
			desktop.headings.join('|') === 'This company|About',
		desktop.headings.join(' | ') || '(none)'
	);
	check('settings: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// The content pane's padding is the shell's own. If the two ever drift, the
// settings destination becomes the one route whose text sits somewhere else —
// which is invisible until you put the two pages side by side.
for (const width of [1440, 800, 375]) {
	const { context: c1, page: p1 } = await open('surface=settings', { width, height: 900 });
	await p1.waitForSelector('.ds-settings-pane');
	const settingsPad = await p1.evaluate(() => {
		const style = getComputedStyle(document.querySelector('.ds-settings-pane'));
		return `${style.paddingTop}/${style.paddingRight}/${style.paddingBottom}/${style.paddingLeft}`;
	});
	await c1.close();

	const { context: c2, page: p2 } = await open('surface=shell', { width, height: 900 });
	await p2.waitForSelector('[data-slot="app-shell-content"]');
	const shellPad = await p2.evaluate(() => {
		const style = getComputedStyle(
			document.querySelector('[data-slot="app-shell-content"] > div')
		);
		return `${style.paddingTop}/${style.paddingRight}/${style.paddingBottom}/${style.paddingLeft}`;
	});
	await c2.close();

	check(
		`settings @ ${width}px: the content pane pads exactly as an ordinary page does`,
		settingsPad === shellPad,
		`settings ${settingsPad} vs page ${shellPad}`
	);
}

// The phone. The list stacks above the content and the PAGE scrolls as one —
// two nested scrollers at 375px is the sideways/nested-scroll hazard this
// package already carries a gate for, and a 240px column here would leave the
// content pane a sliver.
for (const width of [375, 320]) {
	const { context, page, errors } = await open('surface=settings', { width, height: 780 });
	await page.waitForSelector('.ds-settings-pane');
	await page.addStyleTag({ content: SETTLE });

	const phone = await page.evaluate(() => {
		const list = document.querySelector('.ds-settings > nav');
		const pane = document.querySelector('.ds-settings-pane');
		const main = document.querySelector('[data-slot="app-shell-content"]');
		const rows = [...document.querySelectorAll('.ds-settings .ds-nav-item')];
		return {
			listRect: list.getBoundingClientRect(),
			paneRect: pane.getBoundingClientRect(),
			listOverflowY: getComputedStyle(list).overflowY,
			paneOverflowY: getComputedStyle(pane).overflowY,
			listScrollsItself: list.scrollHeight > list.clientHeight,
			paneScrollsItself: pane.scrollHeight > pane.clientHeight,
			mainScrolls: main.scrollHeight > main.clientHeight,
			listBorderBottom: getComputedStyle(list).borderBottomWidth,
			listBorderInlineEnd: getComputedStyle(list).borderInlineEndWidth,
			documentWidth: document.documentElement.scrollWidth,
			// Every section reachable: each row is in the document, has a real box,
			// and is inside the viewport horizontally. That is what "one tap" means
			// once there is no horizontal strip hiding rows behind a swipe.
			rows: rows.map((row) => {
				const rect = row.getBoundingClientRect();
				return { label: row.textContent.trim(), width: rect.width, left: rect.left, right: rect.right };
			})
		};
	});

	check(
		`settings @ ${width}px: the list stacks above the content, full width`,
		Math.round(phone.listRect.width) === width &&
			phone.paneRect.top >= phone.listRect.bottom - 0.5,
		`list ${phone.listRect.width.toFixed(1)}px wide, pane top ${phone.paneRect.top.toFixed(1)} vs list bottom ${phone.listRect.bottom.toFixed(1)}`
	);
	check(
		`settings @ ${width}px: the rule follows the axis — bottom, not inline-end`,
		parseFloat(phone.listBorderBottom) > 0 && parseFloat(phone.listBorderInlineEnd) === 0,
		`bottom ${phone.listBorderBottom}, inline-end ${phone.listBorderInlineEnd}`
	);
	check(
		`settings @ ${width}px: one scroller, the page — neither pane scrolls inside itself`,
		!phone.listScrollsItself && !phone.paneScrollsItself && phone.mainScrolls,
		`list ${phone.listOverflowY}/${phone.listScrollsItself}, pane ${phone.paneOverflowY}/${phone.paneScrollsItself}, page ${phone.mainScrolls}`
	);
	check(
		`settings @ ${width}px: every section is a real box inside the viewport`,
		phone.rows.length === 5 &&
			phone.rows.every((r) => r.width > 0 && r.left >= -0.5 && r.right <= width + 0.5),
		phone.rows
			.map((r) => `${r.label} ${r.width.toFixed(0)}px@${r.left.toFixed(0)}`)
			.join(', ')
	);
	check(
		`settings @ ${width}px: the page does not scroll sideways`,
		phone.documentWidth <= width,
		`${phone.documentWidth}px in ${width}px`
	);
	check(`settings @ ${width}px: no page error`, errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// Panel's settings-section props, which have no meaning without a layout: a
// description that WRAPS (the whole reason it is not `subtitle`), a footer strip
// at the foot of the card, and a destructive tone that is actually a different
// colour from the default one.
{
	const { context, page, errors } = await open('surface=settings', { width: 900, height: 900 });
	await page.waitForSelector('.ds-settings-pane section');
	await page.addStyleTag({ content: SETTLE });

	const panels = await page.evaluate(() => {
		const sections = [...document.querySelectorAll('.ds-settings-pane > section')];
		const users = sections[0];
		const danger = sections.find((s) => s.dataset.tone === 'destructive');
		const description = users.querySelector('header p');
		const footer = users.querySelector('[data-slot="panel-footer"]');
		const line = parseFloat(getComputedStyle(description).lineHeight);
		return {
			descriptionHeight: description.getBoundingClientRect().height,
			descriptionLine: line,
			// The actions row and the title block, so "tops-aligned" is measured
			// rather than read off a class name.
			titleTop: users.querySelector('h2').getBoundingClientRect().top,
			footerTop: footer.getBoundingClientRect().top,
			bodyBottom: users.querySelector('header').nextElementSibling.getBoundingClientRect().bottom,
			footerBorderTop: getComputedStyle(footer).borderTopWidth,
			footerBackground: getComputedStyle(footer).backgroundColor,
			// Right-aligned: the last button's right edge is at the strip's
			// padding edge, not its left one.
			footerJustify: getComputedStyle(footer).justifyContent,
			defaultBorder: getComputedStyle(users).borderTopColor,
			dangerBorder: getComputedStyle(danger).borderTopColor,
			dangerTitle: getComputedStyle(danger.querySelector('h2')).color,
			defaultTitle: getComputedStyle(users.querySelector('h2')).color
		};
	});

	check(
		'settings: a section description WRAPS rather than truncating to one line',
		panels.descriptionHeight > panels.descriptionLine * 1.5,
		`${panels.descriptionHeight.toFixed(1)}px over a ${panels.descriptionLine.toFixed(1)}px line`
	);
	check(
		'settings: the footer sits below the body on a top-bordered tinted strip, right-aligned',
		panels.footerTop >= panels.bodyBottom - 0.5 &&
			parseFloat(panels.footerBorderTop) > 0 &&
			panels.footerBackground !== 'rgba(0, 0, 0, 0)' &&
			panels.footerJustify === 'flex-end',
		`footer top ${panels.footerTop.toFixed(1)} vs body bottom ${panels.bodyBottom.toFixed(1)}, border ${panels.footerBorderTop}, bg ${panels.footerBackground}, justify ${panels.footerJustify}`
	);
	// A tone that resolved to the same colour is the dead affordance this package
	// treats as worse than an absent one, and `border-destructive/40` compiling
	// to nothing would look exactly like this passing.
	check(
		'settings: the destructive tone actually paints a different rule and title',
		panels.dangerBorder !== panels.defaultBorder && panels.dangerTitle !== panels.defaultTitle,
		`rule ${panels.dangerBorder} vs ${panels.defaultBorder}; title ${panels.dangerTitle} vs ${panels.defaultTitle}`
	);
	check('settings: no page error (panels)', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// Density. The need (#39) asks that the destination follow `data-ds-density`,
// and the two halves of that answer differently, which is worth pinning rather
// than leaving a consumer to discover:
//
//   - the CONTROLS in the content pane ride the `--ds-control-*` ramp, so a
//     compact app's Save button is 28px here as it is everywhere else;
//   - the LIST ROWS do not move, because `.ds-nav-item` carries its own padding
//     and always has. That is not the settings list opting out — it is the rail,
//     and the requirement was that this list read as the rail's does. A row that
//     shrank here and not in the rail would be the drift, not the fix.
//
// So the claim measured is equality with the rail at BOTH densities, in the one
// document that holds both.
for (const density of ['comfortable', 'compact']) {
	const { context, page, errors } = await open(`surface=settings&density=${density}`, {
		width: 1440,
		height: 900
	});
	await page.waitForSelector('.ds-settings-pane');
	await page.addStyleTag({ content: SETTLE });

	const measured = await page.evaluate(() => ({
		railRow: document.querySelector('.ds-shell-rail .ds-nav-item').getBoundingClientRect().height,
		settingsRow: document.querySelector('.ds-settings .ds-nav-item').getBoundingClientRect().height,
		paneButton: document
			.querySelector('.ds-settings-pane [data-slot="panel-footer"] button')
			.getBoundingClientRect().height
	}));

	check(
		`settings @ density=${density}: a section row is the rail's row, to the pixel`,
		Math.abs(measured.settingsRow - measured.railRow) < 0.5,
		`settings ${measured.settingsRow.toFixed(1)}px vs rail ${measured.railRow.toFixed(1)}px`
	);
	check(
		`settings @ density=${density}: a control in the pane takes the density ramp`,
		Math.round(measured.paneButton) === (density === 'compact' ? 28 : 36),
		`${measured.paneButton.toFixed(1)}px`
	);
	check(`settings @ density=${density}: no page error`, errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── PageCanvas: the fit/zoom/focus overlay geometry (#839) ──────────────────
// This component's whole reason to exist is pixel geometry — the whole-page
// fit, the beside/above choice for a region's label, and the focus-and-centre
// zoom — and jsdom cannot see any of it: it never lays anything out, so
// `bind:clientWidth`/`clientHeight` on the stage read 0 there and the
// component's own `layout` derivation never leaves null (src/test/
// page-canvas.test.ts covers everything that IS provable without one: the
// pager, the zoom control, the keyboard wiring, the empty state).
//
// Two panes (App.svelte, ?surface=page-canvas): a tall receipt in a pane WIDE
// enough that the whole-page view has room beside it for a label, and an A4
// page in one narrow enough that it never does. Both consumer call sites
// (godswood's DocumentViewer, pebblestone's PdfViewer) size this component
// with an explicit `class="h-full w-full"` on a flex-sized ancestor — the
// harness panes reproduce that contract with a fixed-size block instead of a
// flex ancestor, which is the more demanding case: a block box gives a
// zero-size child no size at all unless the child itself is told to fill it.
{
	const { context, page, errors } = await open('surface=page-canvas');
	await page.waitForSelector('[data-probe="receipt"] img');
	await page.waitForTimeout(300);

	const rect = (sel) =>
		page.evaluate((s) => {
			const el = document.querySelector(s);
			return el ? el.getBoundingClientRect().toJSON() : null;
		}, sel);

	// The whole-page fit: an explicit `h-full w-full` on the component reaches
	// all the way down to a real box, and the fitted page is centred inside it
	// on both axes (never flush left/top, never overflowing the pane).
	const receiptPane = await rect('[data-probe="receipt"]');
	const receiptImg = await rect('[data-probe="receipt"] img');
	check(
		'PageCanvas: an explicit h-full w-full reaches a real box (no size is 0)',
		receiptPane.width > 0 && receiptImg.width > 0 && receiptImg.height > 0,
		`pane ${receiptPane.width}x${receiptPane.height}, page ${receiptImg.width.toFixed(1)}x${receiptImg.height.toFixed(1)}`
	);
	check(
		'PageCanvas: the fitted page never exceeds its pane',
		receiptImg.width <= receiptPane.width && receiptImg.height <= receiptPane.height,
		`page ${receiptImg.width.toFixed(1)}x${receiptImg.height.toFixed(1)} vs pane ${receiptPane.width}x${receiptPane.height}`
	);
	check(
		'PageCanvas: the fitted page is centred, not flush to a corner',
		Math.abs(receiptImg.x - receiptPane.x) > 20 && Math.abs(receiptImg.x + receiptImg.width - (receiptPane.x + receiptPane.width)) > 20,
		`left gap ${(receiptImg.x - receiptPane.x).toFixed(1)}px, right gap ${(receiptPane.x + receiptPane.width - receiptImg.x - receiptImg.width).toFixed(1)}px`
	);

	// Hovering the region beside the page (the app's own list, here a single
	// button standing in for it) outlines it AND, because this pane is wide
	// enough, puts the label beside the outline rather than above it.
	await page.click('[data-action="hover-header"]');
	await page.waitForTimeout(200);
	const outlineWrap = await page.evaluate(() => {
		const el = document.querySelector('[data-probe="receipt"] [role="button"]');
		return el ? el.parentElement.getBoundingClientRect().toJSON() : null;
	});
	const outlineTag = await page.evaluate(() => {
		const wrap = document.querySelector('[data-probe="receipt"] [role="button"]')?.parentElement;
		const tag = wrap?.querySelector('span:not([role])');
		return tag ? { text: tag.textContent.trim(), rect: tag.getBoundingClientRect().toJSON() } : null;
	});
	check(
		'PageCanvas: hovering a region draws a real outline box on the page',
		!!outlineWrap && outlineWrap.width > 0 && outlineWrap.height > 0,
		JSON.stringify(outlineWrap)
	);
	check(
		'PageCanvas: the label carries the region\'s own text',
		outlineTag?.text === 'Header',
		outlineTag?.text
	);
	check(
		'PageCanvas: with room beside the page, the label sits beside the outline, not above it',
		outlineTag.rect.x >= outlineWrap.x + outlineWrap.width,
		`tag left ${outlineTag.rect.x.toFixed(1)} vs outline right ${(outlineWrap.x + outlineWrap.width).toFixed(1)}`
	);

	// The dashed "where it looked" region draws independently of hover/focus.
	const lookedBox = await rect('[data-probe="receipt"] [aria-hidden="true"]');
	check(
		'PageCanvas: the "where it looked" region draws even with nothing hovered or focused',
		!!lookedBox && lookedBox.width > 0 && lookedBox.height > 0,
		JSON.stringify(lookedBox)
	);

	// Clicking the outlined region focuses it: the page zooms in and centres on
	// the region, a "Whole page" affordance appears, and it returns exactly to
	// the prior fit on click.
	await page.click('[data-probe="receipt"] [role="button"]');
	await page.waitForTimeout(300);
	const focusedImg = await rect('[data-probe="receipt"] img');
	const wholePageBtn = () =>
		page.evaluate(
			() =>
				!!Array.from(document.querySelectorAll('[data-probe="receipt"] button')).find(
					(b) => b.textContent.trim() === 'Whole page'
				)
		);
	check(
		'PageCanvas: focusing a region zooms in past the whole-page fit',
		focusedImg.width > receiptImg.width * 1.5,
		`${focusedImg.width.toFixed(1)}px vs whole-page ${receiptImg.width.toFixed(1)}px`
	);
	check('PageCanvas: a "Whole page" way back appears once focused', await wholePageBtn(), 'present');

	await page.locator('[data-probe="receipt"]').getByText('Whole page').click();
	await page.waitForTimeout(300);
	const unfocusedImg = await rect('[data-probe="receipt"] img');
	check(
		'PageCanvas: "Whole page" returns to exactly the prior fit',
		Math.abs(unfocusedImg.width - receiptImg.width) < 0.5 && Math.abs(unfocusedImg.height - receiptImg.height) < 0.5,
		`${unfocusedImg.width.toFixed(1)}x${unfocusedImg.height.toFixed(1)} vs ${receiptImg.width.toFixed(1)}x${receiptImg.height.toFixed(1)}`
	);
	check('PageCanvas: "Whole page" is gone once left', !(await wholePageBtn()), 'gone');

	// The A4 pane is deliberately narrow: even the WHOLE-PAGE view has no room
	// beside it, so a focused region's label must fall back above the outline
	// instead — the same room-check, a different answer.
	const a4WholeImg = await rect('[data-probe="a4"] img');
	await page.click('[data-action="focus-invoice"]');
	await page.waitForTimeout(300);
	const a4FocusedImg = await rect('[data-probe="a4"] img');
	const a4Tag = await page.evaluate(() => {
		const wrap = document.querySelector('[data-probe="a4"] [role="button"]')?.parentElement;
		const tag = wrap?.querySelector('span:not([role])');
		return tag ? { text: tag.textContent.trim(), rect: tag.getBoundingClientRect().toJSON() } : null;
	});
	const a4OutlineWrap = await page.evaluate(() => {
		const el = document.querySelector('[data-probe="a4"] [role="button"]');
		return el ? el.parentElement.getBoundingClientRect().toJSON() : null;
	});
	check(
		'PageCanvas: focusing in the narrow pane still zooms in past the whole-page fit',
		a4FocusedImg.width > a4WholeImg.width * 1.5,
		`${a4FocusedImg.width.toFixed(1)}px vs whole-page ${a4WholeImg.width.toFixed(1)}px`
	);
	check(
		'PageCanvas: with no room beside the page, the label falls back ABOVE the outline',
		a4Tag.rect.y + a4Tag.rect.height <= a4OutlineWrap.y + 1,
		`tag bottom ${(a4Tag.rect.y + a4Tag.rect.height).toFixed(1)} vs outline top ${a4OutlineWrap.y.toFixed(1)}`
	);

	// Escape is the keyboard way back, proved on the pane already focused.
	await page.locator('[data-probe="a4"] [role="document"]').focus();
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	const a4WholePageBtn = await page.evaluate(
		() =>
			!!Array.from(document.querySelectorAll('[data-probe="a4"] button')).find(
				(b) => b.textContent.trim() === 'Whole page'
			)
	);
	check('PageCanvas: Escape is also a way back to the whole page', !a4WholePageBtn, 'gone');

	// ── Fix 2 (review of 6a5e2fe): focusing a region on ANOTHER page turns to
	// it, as the approved canvas does (`pg = pinned ? line.page : st.pg`);
	// hovering (never decisive enough to leave the page being read) must not.
	// The receipt pane is a second page (App.svelte) with its OWN image, since
	// reusing one <img src> across pages never re-fires `onload` — the exact
	// shape of bug that would have hidden this fix behind an unmeasured page.
	await page.click('[data-action="focus-page2"]');
	await page.waitForTimeout(300);
	const crossPageTag = await page.evaluate(() => {
		const wrap = document.querySelector('[data-probe="receipt"] [role="button"]')?.parentElement;
		return wrap?.querySelector('span:not([role])')?.textContent?.trim();
	});
	const crossPageWholeBtn = await page.evaluate(
		() =>
			!!Array.from(document.querySelectorAll('[data-probe="receipt"] button')).find(
				(b) => b.textContent.trim() === 'Whole page'
			)
	);
	check(
		'PageCanvas: focusing a region on another page turns to that page and focuses it',
		crossPageTag === 'On page 2' && crossPageWholeBtn,
		`tag "${crossPageTag}", Whole page ${crossPageWholeBtn ? 'present' : 'absent'}`
	);

	// The pager is not on screen while focused ("Whole page" takes its place),
	// so clear the focus before paging back.
	await page.locator('[data-probe="receipt"]').getByText('Whole page').click();
	await page.waitForTimeout(300);
	await page.click('[data-probe="receipt"] [aria-label="Previous page"]');
	await page.waitForTimeout(300);
	await page.click('[data-action="hover-page2"]');
	await page.waitForTimeout(200);
	const pageAfterHoveringElsewhere = await page
		.evaluate(() => document.querySelector('[data-probe="receipt"] .tabular-nums')?.textContent)
		.then((t) => t?.trim());
	check(
		'PageCanvas: hovering (activeRegionId), unlike focusing, does NOT turn the page',
		pageAfterHoveringElsewhere === '1 / 2',
		pageAfterHoveringElsewhere
	);
	await page.click('[data-action="hover-page2"]');

	// ── Fix 3 (review of 6a5e2fe): a dashed region's label must land at the
	// same spot beside the page regardless of the region's OWN x offset — the
	// pre-fix formula (`left: layout.width + 10`, inside a box already offset
	// by the region's x) put a region starting away from the page's left edge
	// past the page's right edge by that same offset. Two "looked" regions on
	// this page (App.svelte): one at x=0, one at x=0.3.
	const lookedTagLefts = await page.evaluate(() =>
		Array.from(document.querySelectorAll('[data-probe="receipt"] .border-dashed span')).map(
			(el) => el.getBoundingClientRect().x
		)
	);
	check(
		"PageCanvas: a dashed region's label sits beside the PAGE's edge, not offset by the region's own x",
		lookedTagLefts.length === 2 && Math.abs(lookedTagLefts[0] - lookedTagLefts[1]) < 1,
		JSON.stringify(lookedTagLefts)
	);

	// ── Fix 1 (review of 6a5e2fe): zoomed past 100%, the page must scroll
	// inside the pane rather than clip with no way to reach its edges, and
	// the pager/zoom controls must stay pinned to the pane's corners rather
	// than scrolling away with it. The receipt (tall, narrow) overflows
	// VERTICALLY at 300%; the A4 pane (wider) below overflows HORIZONTALLY —
	// between the two, both axes of the fix are exercised for real.
	const zoomCtrlBeforeScroll = await page.evaluate(() =>
		document.querySelector('[data-probe="receipt"] [aria-label="Zoom in"]').getBoundingClientRect().toJSON()
	);
	await page.click('[data-action="zoom-300-receipt"]');
	await page.waitForTimeout(300);
	const receiptScroll = await page.evaluate(() => {
		const stage = document.querySelector('[data-probe="receipt"] .overflow-auto');
		return { scrollHeight: stage.scrollHeight, clientHeight: stage.clientHeight };
	});
	check(
		'PageCanvas: zoomed past the pane, the stage genuinely scrolls (vertical)',
		receiptScroll.scrollHeight > receiptScroll.clientHeight + 10,
		JSON.stringify(receiptScroll)
	);
	const receiptScrolledTop = await page.evaluate(() => {
		const stage = document.querySelector('[data-probe="receipt"] .overflow-auto');
		stage.scrollTo({ top: stage.scrollHeight - stage.clientHeight });
		return stage.scrollTop;
	});
	check(
		"PageCanvas: the page's far (bottom) edge is actually reachable by scrolling",
		receiptScrolledTop > 0,
		`scrollTop ${receiptScrolledTop}`
	);
	const zoomCtrlAfterScroll = await page.evaluate(() =>
		document.querySelector('[data-probe="receipt"] [aria-label="Zoom in"]').getBoundingClientRect().toJSON()
	);
	check(
		'PageCanvas: the zoom control stays pinned to the pane corner while the page scrolls under it',
		zoomCtrlBeforeScroll.x === zoomCtrlAfterScroll.x && zoomCtrlBeforeScroll.y === zoomCtrlAfterScroll.y,
		`before ${JSON.stringify(zoomCtrlBeforeScroll)}, after ${JSON.stringify(zoomCtrlAfterScroll)}`
	);

	await page.click('[data-action="zoom-300-a4"]');
	await page.waitForTimeout(300);
	const a4Scroll = await page.evaluate(() => {
		const stage = document.querySelector('[data-probe="a4"] .overflow-auto');
		return { scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth };
	});
	check(
		'PageCanvas: zoomed past the pane, the stage genuinely scrolls (horizontal)',
		a4Scroll.scrollWidth > a4Scroll.clientWidth + 10,
		JSON.stringify(a4Scroll)
	);
	const a4ScrolledLeft = await page.evaluate(() => {
		const stage = document.querySelector('[data-probe="a4"] .overflow-auto');
		stage.scrollTo({ left: stage.scrollWidth - stage.clientWidth });
		return stage.scrollLeft;
	});
	check(
		"PageCanvas: the page's far (right) edge is actually reachable by scrolling",
		a4ScrolledLeft > 0,
		`scrollLeft ${a4ScrolledLeft}`
	);

	check('PageCanvas: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── FactGrid inside a Panel: no double border (#839) ─────────────────────────
// The whole reason FactGrid exists beside StatList: a Panel already draws the
// card, so FactGrid must draw none of its own — a claim about a resolved
// border WIDTH, which jsdom cannot make (fact-grid.test.ts already covers the
// class-name half: numeric-vs-plain-words and the long-value row span).
{
	const { context, page, errors } = await open('surface=fact-grid');
	await page.waitForSelector('dl');

	const measured = await page.evaluate(() => {
		const panel = document.querySelector('section');
		const dl = document.querySelector('dl');
		const cells = Array.from(dl.children);
		const find = (text) => cells.find((c) => c.textContent.includes(text));
		return {
			panelBorder: getComputedStyle(panel).borderWidth,
			gridBorder: getComputedStyle(dl).borderWidth,
			addressWidth: find('Address').getBoundingClientRect().width,
			gridWidth: dl.getBoundingClientRect().width,
			totalFont: getComputedStyle(find('Total').querySelector('dd')).fontFamily,
			storeFont: getComputedStyle(find('Store').querySelector('dd')).fontFamily
		};
	});

	check('FactGrid: the Panel draws a real border', measured.panelBorder !== '0px', measured.panelBorder);
	check('FactGrid: FactGrid itself draws none — no box in a box', measured.gridBorder === '0px', measured.gridBorder);
	check(
		'FactGrid: a long value spans the full grid row width',
		Math.abs(measured.addressWidth - measured.gridWidth) < 1,
		`${measured.addressWidth.toFixed(1)}px vs grid ${measured.gridWidth.toFixed(1)}px`
	);
	check(
		'FactGrid: a numeric fact resolves the mono figures face',
		measured.totalFont.includes('JetBrains Mono'),
		measured.totalFont
	);
	check(
		'FactGrid: a plain-words fact does NOT resolve the mono face',
		!measured.storeFont.includes('JetBrains Mono'),
		measured.storeFont
	);
	check('FactGrid: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── DataTableTanstack: the sticky header actually sticks on WebKit, and a row
// beneath it stays tappable (radar-hooves/godswood, 30/09/2026) ────────────
// godswood's Workshop list — a plain DataTableTanstack with row click — could
// not be tapped on Mobile Safari (E2E, 31/08/2026, `@poodle64/ui@2026.8.11`).
// The actual mechanism, found by driving the unmodified component in a real
// engine rather than guessing from the label: table.svelte's own scroll
// container (`data-slot=table-container`) carries `overflow-x-auto`, and per
// the CSS Overflow spec `overflow-x` other than `visible` forces `overflow-y`
// to compute `auto` too — making that div a scroll container in its own right
// even though it never actually scrolls (it is always sized to its own
// content). A `position: sticky` element's containing block is its NEAREST
// ancestor scroll container, so the header pinned to that inert box and never
// visibly stuck AT ALL — measured here in BOTH engines, not only WebKit, so
// this is not the WebKit-only hit-testing fault it was reported as; it is a
// universal defect this package shipped since the component's creation.
// Folding DataTableTanstack's own scroll region into table.svelte's own
// `containerClass` (rather than wrapping a second scrolling div around it),
// and moving `sticky` from `<thead>` onto each `<th>` (WebKit has a long
// history of not reliably keeping sticky positioning on a table-section box),
// fixes it: confirmed directly against this repo's own pinned Playwright
// (1.62.0) on both chromium and webkit — before, a header cell's bounding-box
// top drifted 1:1 with scroll; after, it holds constant.
{
	const { context, page, errors } = await openWebkit('surface=row-tap');
	await page.waitForSelector('[data-probe="row-tap-wrap"] tbody tr');

	const geometry = await page.evaluate(() => {
		const wrap = document.querySelector('[data-probe="row-tap-wrap"]');
		const scroller = wrap.querySelector('[data-slot="table-container"]');
		const th = wrap.querySelector('thead th');
		const beforeTop = th.getBoundingClientRect().top;
		scroller.scrollTop = 300;
		const afterTop = th.getBoundingClientRect().top;
		const thBottom = th.getBoundingClientRect().bottom;
		const rows = [...wrap.querySelectorAll('tbody tr')].map((tr) => {
			const r = tr.getBoundingClientRect();
			return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
		});
		// The first row NOT covered by the (now correctly pinned) sticky header —
		// i.e. genuinely visible, tappable content immediately beneath it.
		const firstVisible = rows.find((r) => r.top >= thBottom);
		return { beforeTop, afterTop, firstVisible };
	});

	check(
		'DataTableTanstack on WebKit: the sticky header stays pinned after scrolling',
		Math.abs(geometry.afterTop - geometry.beforeTop) < 1,
		`top went from ${geometry.beforeTop.toFixed(1)}px to ${geometry.afterTop.toFixed(1)}px`
	);

	const x = (geometry.firstVisible.left + geometry.firstVisible.right) / 2;
	const y = (geometry.firstVisible.top + geometry.firstVisible.bottom) / 2;
	await page.touchscreen.tap(x, y);
	const selectedByTouch = await page.textContent('[data-probe="row-tap-selected"]');
	check(
		'DataTableTanstack on WebKit: a row beneath the sticky header is tappable (touch)',
		selectedByTouch !== 'none',
		`selected = "${selectedByTouch}"`
	);

	check('DataTableTanstack on WebKit: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── The ledger (radar-hooves/godswood, 01/10/2026) ──────────────────────────
// Every look the operator ruled is a layout or paint fact, so it is measured
// here and nowhere else: the head card exactly as wide as the group cards with
// its columns on theirs to the pixel, each group its own rounded card on the
// raised surface with its label on the page ground above it, a row's text
// centred on the row whether or not it carries a note, the checkbox, dot, date
// and amount centred too, money in painted the status-success ink, figures in
// the body face with tabular numerals, and the head held at the top while the
// rows scroll under it. Then the same at a phone's width (no overflow) and at
// the operator's 3360px desk (the wide tracks).
{
	/** Every geometry and paint fact one ledger page answers, in one evaluate. */
	const measureLedger = () =>
		page.evaluate(() => {
			const box = (el) => {
				const r = el.getBoundingClientRect();
				return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
			};
			const mid = (el) => {
				const r = el.getBoundingClientRect();
				return (r.top + r.bottom) / 2;
			};
			const head = document.querySelector('[data-slot="ledger-head"]');
			const cards = [...document.querySelectorAll('[data-slot="ledger-card"]')];
			const groups = [...document.querySelectorAll('[data-slot="ledger-group"]')];
			const rows = [...document.querySelectorAll('[data-slot="ledger-row"]')];
			const row = (text) => rows.find((r) => r.textContent.includes(text));
			const inkOf = (value) => {
				const probe = document.createElement('span');
				probe.style.color = value;
				document.body.append(probe);
				const c = getComputedStyle(probe).color;
				probe.remove();
				return c;
			};
			// A row's cells are its grid's children after the gutter (and the
			// row's open button, which spans every column).
			const cellsOf = (r) => [...r.children].filter((c) => c.tagName !== 'BUTTON').slice(1);
			const headCells = head ? [...head.children].slice(1) : [];
			const first = rows[0];
			const noNote = head && rows.find((r) => r.textContent.includes('Ray White') && !r.querySelector('[data-slot="ledger-title"] > span:nth-child(2)'));
			const withNote = head && row('Urban Utilities');
			const titleOf = (r) => r.querySelector('[data-slot="ledger-title"]');
			const income = rows.map((r) => r.querySelector('[data-slot="ledger-amount"]')).find((a) => !a.textContent.includes('('));
			const outgo = rows.map((r) => r.querySelector('[data-slot="ledger-amount"]')).find((a) => a.textContent.includes('('));
			const region = document.querySelector('[data-slot="ledger-rows"]');
			return {
				head: head ? box(head) : null,
				cards: cards.map(box),
				cardRadius: cards[0] ? getComputedStyle(cards[0]).borderTopLeftRadius : '',
				cardBorder: cards[0] ? getComputedStyle(cards[0]).borderTopWidth : '',
				cardBg: cards[0] ? getComputedStyle(cards[0]).backgroundColor : '',
				groundBg: getComputedStyle(document.querySelector('[data-slot="ledger"]').parentElement).backgroundColor,
				// Each label with the card right after it, where the window has mounted one.
				groups: groups.map((g) => {
					const next = g.parentElement.nextElementSibling;
					return {
						...box(g),
						bg: getComputedStyle(g).backgroundColor,
						text: g.textContent.replace(/\s+/g, ' ').trim(),
						card: next && next.dataset.slot === 'ledger-card' ? box(next) : null
					};
				}),
				headTexts: headCells.map((c) => c.textContent.trim()),
				headEdges: headCells.map(box).map((b) => [b.left, b.right]),
				rowEdges: first ? cellsOf(first).map(box).map((b) => [b.left, b.right]) : [],
				noNote: noNote && {
					row: mid(noNote),
					title: mid(titleOf(noNote).firstElementChild),
					box: mid(noNote.querySelector('[data-slot="checkbox"]')),
					amount: mid(noNote.querySelector('[data-slot="ledger-amount"]')),
					dot: noNote.querySelector('[data-slot="ledger-review"]') ? mid(noNote.querySelector('[data-slot="ledger-review"]')) : null
				},
				withNote: withNote && {
					row: mid(withNote),
					block: mid(titleOf(withNote)),
					lines: titleOf(withNote).children.length,
					date: [...withNote.children].find((c) => /^\d+ \w{3}/.test(c.textContent.trim())) ? mid([...withNote.children].find((c) => /^\d+ \w{3}/.test(c.textContent.trim()))) : null
				},
				incomeInk: income ? getComputedStyle(income).color : '',
				outgoInk: outgo ? getComputedStyle(outgo).color : '',
				outgoText: outgo ? outgo.textContent.trim() : '',
				successInk: inkOf('var(--ds-color-status-success)'),
				amountFont: income ? getComputedStyle(income).fontFamily : '',
				amountNumeric: income ? getComputedStyle(income).fontVariantNumeric : '',
				bodyFont: getComputedStyle(document.body).fontFamily,
				overflow: region ? region.scrollWidth - region.clientWidth : null,
				docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
				dateTrack: head && headCells[0] ? box(headCells[0]).width : 0,
				layout: document.querySelector('[data-slot="ledger"]').dataset.layout
			};
		});

	let { context, page, errors } = await open('surface=ledger', { width: 1440, height: 900 }, 'dark');
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="ledger-row"]');
	let m = await measureLedger();

	check('Ledger: no panel wraps it — the toolbar sits on the page ground', m.groundBg !== m.cardBg, `ground ${m.groundBg}, card ${m.cardBg}`);
	check(
		'Ledger: the head card is exactly as wide as every group card',
		m.cards.every((c) => Math.abs(c.width - m.head.width) < 0.5 && Math.abs(c.left - m.head.left) < 0.5),
		`head ${m.head.left.toFixed(1)}+${m.head.width.toFixed(1)}; cards ${m.cards.map((c) => `${c.left.toFixed(1)}+${c.width.toFixed(1)}`).join(', ')}`
	);
	check(
		'Ledger: every head column sits on its row column to the pixel',
		m.headEdges.length > 0 &&
			m.headEdges.length === m.rowEdges.length &&
			m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5),
		`head ${JSON.stringify(m.headEdges.map((e) => e.map(Math.round)))} rows ${JSON.stringify(m.rowEdges.map((e) => e.map(Math.round)))}`
	);
	check(
		'Ledger: each group is a rounded card with a hairline border on the raised surface',
		parseFloat(m.cardRadius) >= 6 && m.cardBorder === '1px' && m.cardBg !== m.groundBg,
		`radius ${m.cardRadius}, border ${m.cardBorder}, card ${m.cardBg}`
	);
	check(
		'Ledger: a group’s label sits on the page ground just above its own card, with ground between cards',
		m.groups.filter((g) => g.card).length >= 2 &&
			m.groups.every((g) => g.bg === 'rgba(0, 0, 0, 0)' && (!g.card || (g.bottom <= g.card.top + 0.5 && g.card.top - g.bottom < 12))) &&
			m.cards.slice(1).every((c, i) => c.top - m.cards[i].bottom > 16),
		m.groups.map((g) => `${g.text}: label ${g.bottom.toFixed(0)} card ${g.card?.top.toFixed(0) ?? '(not mounted)'}`).join('; ')
	);
	check(
		'Ledger: a row with no note centres its title on the row',
		m.noNote && Math.abs(m.noNote.title - m.noNote.row) < 1,
		m.noNote ? `title ${m.noNote.title.toFixed(1)} row ${m.noNote.row.toFixed(1)}` : 'no such row'
	);
	check(
		'Ledger: a two-line row centres its title and note as one block',
		m.withNote && m.withNote.lines === 2 && Math.abs(m.withNote.block - m.withNote.row) < 1,
		m.withNote ? `block ${m.withNote.block.toFixed(1)} row ${m.withNote.row.toFixed(1)}, ${m.withNote.lines} lines` : 'no such row'
	);
	check(
		'Ledger: the checkbox, the review chip, the date and the amount centre on the row',
		m.noNote && [m.noNote.box, m.noNote.dot, m.noNote.amount].every((y) => y !== null && Math.abs(y - m.noNote.row) < 1) && m.withNote.date !== null && Math.abs(m.withNote.date - m.withNote.row) < 1,
		m.noNote ? `row ${m.noNote.row.toFixed(1)}: box ${m.noNote.box?.toFixed(1)}, dot ${m.noNote.dot?.toFixed(1)}, amount ${m.noNote.amount.toFixed(1)}; date ${m.withNote.date?.toFixed(1)} on ${m.withNote.row.toFixed(1)}` : 'no such row'
	);
	check('Ledger: money in is painted the status-success ink', m.incomeInk === m.successInk, `${m.incomeInk} vs ${m.successInk}`);
	check(
		'Ledger: money out is bracketed and not green',
		/^\(\$[\d,]+\.\d\d\)$/.test(m.outgoText) && m.outgoInk !== m.successInk,
		`${m.outgoText} in ${m.outgoInk}`
	);
	check(
		'Ledger: figures are the body face with tabular numerals, never mono',
		m.amountFont === m.bodyFont && m.amountNumeric.includes('tabular-nums'),
		`${m.amountFont} / ${m.amountNumeric}`
	);

	// The bars above the list end where its cards do, clear of the scroll bar's gutter.
	const trigger = await page.evaluate(() => document.querySelector('[data-slot="ledger-columns-trigger"]').getBoundingClientRect().right);
	check('Ledger: the toolbar ends where the cards do', Math.abs(trigger - m.head.right) < 0.5, `toolbar ${trigger.toFixed(1)}, cards ${m.head.right.toFixed(1)}`);
	await page.click('[aria-label^="Select Ray White"]');
	const bulk = await page.evaluate(() => {
		const r = document.querySelector('[data-slot="ledger-bulk"]').getBoundingClientRect();
		return { left: r.left, right: r.right };
	});
	check(
		'Ledger: a tick swaps the toolbar for a bulk bar as wide as the cards',
		Math.abs(bulk.left - m.head.left) < 0.5 && Math.abs(bulk.right - m.head.right) < 0.5,
		`bar ${bulk.left.toFixed(1)}–${bulk.right.toFixed(1)}, cards ${m.head.left.toFixed(1)}–${m.head.right.toFixed(1)}`
	);
	await page.click('[data-slot="ledger-bulk"] button[aria-label="Clear the ticks"]');

	// A row's own Open control carries the house focus ring when the keyboard reaches it.
	const ring = await page.evaluate(() => {
		const row = [...document.querySelectorAll('[data-slot="ledger-row"]')].find((r) => r.textContent.includes('Ray White'));
		const button = [...row.children].find((c) => c.tagName === 'BUTTON');
		return { rest: getComputedStyle(button).boxShadow };
	});
	await page.focus('[aria-label^="Select Ray White"]');
	await page.keyboard.press('Tab');
	const focused = await page.evaluate(() => ({
		label: document.activeElement.getAttribute('aria-label') ?? '',
		shadow: getComputedStyle(document.activeElement).boxShadow,
		visible: document.activeElement.matches(':focus-visible')
	}));
	check(
		'Ledger: the keyboard reaches a row’s Open control and it wears the house ring',
		focused.label.startsWith('Open Ray White') && focused.visible && focused.shadow !== ring.rest && /inset/.test(focused.shadow),
		`${focused.label}: ${focused.shadow} (at rest ${ring.rest})`
	);

	// The head stays at the top while the rows scroll under it.
	const headTop = m.head.top;
	await page.evaluate(() => (document.querySelector('[data-slot="ledger-rows"]').scrollTop = 600));
	const afterScroll = await page.evaluate(() => document.querySelector('[data-slot="ledger-head"]').getBoundingClientRect().top);
	check('Ledger: the head card stays put while the rows scroll', Math.abs(afterScroll - headTop) < 0.5, `top ${headTop.toFixed(1)} → ${afterScroll.toFixed(1)}`);
	// Needs 1–4 of 02/10/2026: sorting heads, one control for every group, the review chip, conversions.
	await page.evaluate(() => (document.querySelector('[data-slot="ledger-rows"]').scrollTop = 0));
	const grouping = await page.evaluate(() => {
		const centreX = (el) => {
			const r = el.getBoundingClientRect();
			return (r.left + r.right) / 2;
		};
		const all = document.querySelector('[data-slot="ledger-all-groups"] svg');
		const chev = document.querySelector('[data-slot="ledger-group"] svg');
		const row = [...document.querySelectorAll('[data-slot="ledger-row"]')].find((r) => r.textContent.includes('Ray White'));
		const chip = row.querySelector('[data-slot="ledger-review"]');
		const title = row.querySelector('[data-slot="ledger-title"]');
		const first = title.firstElementChild;
		const text = first.firstElementChild;
		const rows = [...document.querySelectorAll('[data-slot="ledger-row"]')];
		const plain = rows.find((r) => r.textContent.includes('Bitcoin'))?.querySelector('[data-slot="ledger-amount"]');
		const green = rows.find((r) => r.textContent.includes('Ray White') && !r.textContent.includes('Bitcoin'))?.querySelector('[data-slot="ledger-amount"]');
		return {
			allX: centreX(all),
			chevX: centreX(chev),
			chipMid: (chip.getBoundingClientRect().top + chip.getBoundingClientRect().bottom) / 2,
			lineMid: (first.getBoundingClientRect().top + first.getBoundingClientRect().bottom) / 2,
			chipAfterTitle: chip.getBoundingClientRect().left >= text.getBoundingClientRect().right - 0.5,
			chipInLineOne: first.contains(chip),
			plainInk: plain ? getComputedStyle(plain).color : '',
			greenInk: green ? getComputedStyle(green).color : ''
		};
	});
	check('Ledger: the all-groups chevron sits over the group chevrons in the one gutter', Math.abs(grouping.allX - grouping.chevX) < 1, `head ${grouping.allX.toFixed(1)}, group ${grouping.chevX.toFixed(1)}`);
	check('Ledger: the review chip sits on line one, after the title and centred with it', grouping.chipInLineOne && grouping.chipAfterTitle && Math.abs(grouping.chipMid - grouping.lineMid) < 1.5, `chip ${grouping.chipMid.toFixed(1)}, line ${grouping.lineMid.toFixed(1)}`);
	check('Ledger: a conversion’s amount is plain, not income green', grouping.plainInk !== m.successInk && grouping.greenInk === m.successInk, `plain ${grouping.plainInk}, income ${grouping.greenInk}`);
	await page.click('[data-slot="ledger-all-groups"]');
	check('Ledger: the head control closes every group at once', (await page.locator('[data-slot="ledger-row"]').count()) === 0 && (await page.locator('[data-slot="ledger-group"]').count()) >= 3);
	await page.click('[data-slot="ledger-all-groups"]');
	check('Ledger: and opens them all again', (await page.locator('[data-slot="ledger-row"]').count()) > 0);
	const before = await measureLedger();
	await page.click('[aria-label="Sort by Amount"]');
	m = await measureLedger();
	const sorted = await page.evaluate(() =>
		[...document.querySelectorAll('[data-slot="ledger-card"]')].map((card) =>
			[...card.querySelectorAll('[data-slot="ledger-amount"]')].map((a) => Number(a.textContent.replace(/[^\d.-]/g, '').replace(/^\(?(.*)$/, '$1')) * (a.textContent.includes('(') ? -1 : 1))
		)
	);
	check(
		'Ledger sorted: the groups and their cards stay, head still on the rows to the pixel, largest first inside each group',
		m.cards.length === before.cards.length && m.groups.length === before.groups.length && m.groups.length > 1 && m.cards[0].left === m.head.left && Math.abs(m.cards[0].width - m.head.width) < 0.5 && m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5) && sorted.every((card) => card.slice(1).every((v, i) => card[i] >= v)),
		`${m.cards.length} cards, ${m.groups.length} groups, ${sorted.map((c) => c.slice(0, 3).join('/')).join(' | ')}`
	);
	await page.click('[aria-label^="Sorted by Amount, descending"]');
	const asc = await page.getAttribute('[data-slot="ledger-sort"][data-sort]', 'data-sort');
	await page.click('[aria-label^="Sorted by Amount, ascending"]');
	check('Ledger: a third click on the head clears the sort', asc === 'asc' && (await page.locator('[data-slot="ledger-sort"][data-sort]').count()) === 0 && (await page.locator('[aria-label="Sort by Amount"]').count()) === 1);
	check('Ledger: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	// A long title gives way to the review chip, on a phone and on a laptop.
	for (const [w, label] of [[390, 'phone'], [1000, 'narrow']]) {
		({ context, page, errors } = await open('surface=ledger&longchip=1', { width: w, height: 900 }, 'light'));
		await page.addStyleTag({ content: SETTLE });
		await page.waitForSelector('[data-slot="ledger-row"]');
		const fit = await page.evaluate(() => {
			const row = [...document.querySelectorAll('[data-slot="ledger-row"]')].find((r) => r.textContent.includes('Ray White Real'));
			const chip = row.querySelector('[data-slot="ledger-review"]');
			const text = chip.parentElement.firstElementChild;
			const card = row.closest('[data-slot="ledger-card"]').getBoundingClientRect();
			const c = chip.getBoundingClientRect();
			return { cut: text.scrollWidth > text.clientWidth, chipWide: c.width, chipWithin: c.right <= card.right && c.left >= card.left, label: chip.textContent.trim() };
		});
		check(`Ledger ${label}: the title truncates before the review chip does`, fit.cut && fit.chipWithin && fit.chipWide > 40 && fit.label === 'Review', JSON.stringify(fit));
		await context.close();
	}

	// By day, the date heads the group and its column goes; the head still lines up.
	({ context, page, errors } = await open('surface=ledger&period=day&balance=1', { width: 1440, height: 900 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="ledger-row"]');
	m = await measureLedger();
	check(
		'Ledger by day: the date heads each group and the Date column goes, the balance last',
		!m.headTexts.includes('Date') &&
			m.headTexts.at(-1) === 'Balance' &&
			/^Thursday 1 Oct/.test(m.groups[0]?.text ?? '') &&
			m.groups.every((g) => !g.text.includes('In $')),
		`${m.headTexts.join(' | ')}; first group "${m.groups[0]?.text}"`
	);
	check(
		'Ledger by day, light: the head still sits on the rows and the cards on the raised surface',
		m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5) && m.cardBg !== m.groundBg,
		`card ${m.cardBg}, ground ${m.groundBg}`
	);
	check('Ledger by day: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	// A row opened in place lifts out of its card: the card splits around it.
	({ context, page, errors } = await open('surface=ledger&open=3', { width: 1440, height: 900 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-probe="ledger-editor"]');
	const lifted = await page.evaluate(() => {
		const open = document.querySelector('[data-slot="ledger-open"]');
		const r = open.getBoundingClientRect();
		const above = open.parentElement.previousElementSibling.getBoundingClientRect();
		const below = open.parentElement.nextElementSibling.getBoundingClientRect();
		return { gapAbove: r.top - above.bottom, gapBelow: below.top - r.bottom, shadow: getComputedStyle(open).boxShadow };
	});
	check(
		'Ledger: an opened row lifts out of its card, set apart by space and shadow',
		lifted.gapAbove >= 6 && lifted.gapBelow >= 6 && lifted.shadow !== 'none',
		`gap ${lifted.gapAbove.toFixed(1)}/${lifted.gapBelow.toFixed(1)}, shadow ${lifted.shadow}`
	);
	check('Ledger opened: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	// A module's cell holding a control: the click is the control's, and a plain cell still opens the row.
	({ context, page, errors } = await open('surface=ledger&labels=1', { width: 1440, height: 900 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-probe="ledger-label"]');
	// By coordinates, not by locator: a control the row's button swallows must fail this check, not time out.
	const at = await page.evaluate(() => {
		const r = document.querySelector('[data-probe="ledger-label"]').getBoundingClientRect();
		return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
	});
	await page.mouse.click(at.x, at.y);
	const chip = await page.evaluate(() => ({
		clicked: document.querySelector('[data-probe="ledger-label-clicked"]').textContent,
		opened: !!document.querySelector('[data-probe="ledger-editor"]')
	}));
	check('Ledger: a control in a module’s cell takes its own click', chip.clicked === '4:tax' && !chip.opened, JSON.stringify(chip));
	if (!chip.opened) {
		const bunnings = await page.evaluate(() => {
			const row = [...document.querySelectorAll('[data-slot="ledger-row"]')].find((r) => r.textContent.includes('Bunnings'));
			const r = row.querySelector('[data-slot="ledger-amount"]').getBoundingClientRect();
			return { x: r.left + 4, y: (r.top + r.bottom) / 2 };
		});
		await page.mouse.click(bunnings.x, bunnings.y);
	}
	const opened = await page.evaluate(() => document.querySelector('[data-probe="ledger-editor"]')?.textContent.trim() ?? '');
	check('Ledger: a click on a plain cell still opens the row', !chip.opened && opened.startsWith('Editing Bunnings'), opened);
	check('Ledger with a control in a cell: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	// An account with years of history: only the rows near the view mount, wherever it scrolls.
	for (const period of ['none', 'month']) {
		const t0 = Date.now();
		({ context, page, errors } = await open(`surface=ledger&many=5000&period=${period}`, { width: 1440, height: 900 }, 'dark'));
		await page.addStyleTag({ content: SETTLE });
		await page.waitForSelector('[data-slot="ledger-row"]');
		const firstRow = Date.now() - t0;
		const atTop = await measureLedger();
		const mountedAtTop = await page.evaluate(() => document.querySelectorAll('[data-slot="ledger-row"]').length);
		// Halfway down, then at the very end: rows under the head, the head still on them.
		await page.evaluate(() => {
			const el = document.querySelector('[data-slot="ledger-rows"]');
			el.scrollTop = el.scrollHeight / 2;
		});
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
		const middle = await page.evaluate(() => {
			const list = document.querySelector('[data-slot="ledger-rows"]').getBoundingClientRect();
			const head = document.querySelector('[data-slot="ledger-head"]');
			const below = head.getBoundingClientRect().bottom;
			const row = [...document.querySelectorAll('[data-slot="ledger-row"]')].find((r) => r.getBoundingClientRect().top >= below);
			const cells = [...row.children].filter((c) => c.tagName !== 'BUTTON').slice(1).map((c) => c.getBoundingClientRect());
			const heads = [...head.children].slice(1).map((c) => c.getBoundingClientRect());
			return {
				mounted: document.querySelectorAll('[data-slot="ledger-row"]').length,
				rowTop: row.getBoundingClientRect().top - below,
				inView: row.getBoundingClientRect().bottom <= list.bottom,
				aligned: heads.length === cells.length && heads.every((h, i) => Math.abs(h.left - cells[i].left) < 0.5 && Math.abs(h.right - cells[i].right) < 0.5)
			};
		});
		await page.evaluate(() => {
			const el = document.querySelector('[data-slot="ledger-rows"]');
			el.scrollTop = el.scrollHeight;
		});
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
		const end = await page.evaluate(() => {
			const list = document.querySelector('[data-slot="ledger-rows"]');
			const rows = [...document.querySelectorAll('[data-slot="ledger-row"]')];
			const lastRow = rows.at(-1).getBoundingClientRect();
			return {
				padBottom: document.querySelector('[data-slot="ledger-body"]').style.paddingBottom,
				lastInView: lastRow.bottom <= list.getBoundingClientRect().bottom && lastRow.bottom > list.getBoundingClientRect().top
			};
		});
		check(
			`Ledger at 5,000 rows by ${period}: a screen of rows mounts, not the account`,
			mountedAtTop > 10 && mountedAtTop < 100 && middle.mounted < 100,
			`${mountedAtTop} rows mounted at the top, ${middle.mounted} halfway; first row in ${firstRow}ms`
		);
		check(
			`Ledger at 5,000 rows by ${period}: the head sits on the rows at the top and halfway down`,
			atTop.headEdges.every(([l, r], i) => Math.abs(l - atTop.rowEdges[i][0]) < 0.5 && Math.abs(r - atTop.rowEdges[i][1]) < 0.5) &&
				middle.aligned &&
				middle.inView &&
				middle.rowTop < 120,
			`halfway: first row ${middle.rowTop.toFixed(1)}px under the head, aligned ${middle.aligned}`
		);
		check(
			`Ledger at 5,000 rows by ${period}: the last row is reached at the end`,
			end.padBottom === '0px' && end.lastInView,
			JSON.stringify(end)
		);
		check(`Ledger at 5,000 rows by ${period}: no page error`, errors.length === 0, JSON.stringify(errors));
		await context.close();
	}

	// A laptop's ledger: the narrow tracks, and still the head on the rows.
	({ context, page, errors } = await open('surface=ledger&balance=1', { width: 1000, height: 800 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="ledger-row"]');
	m = await measureLedger();
	check(
		'Ledger at 1000px: the narrow tracks, the head on the rows, nothing sideways',
		m.layout === 'narrow' &&
			Math.abs(m.dateTrack - 68) < 1 &&
			m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5) &&
			m.overflow <= 0,
		`layout ${m.layout}, date track ${m.dateTrack.toFixed(1)}px, overflow ${m.overflow}px`
	);
	check('Ledger at 1000px: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	// A phone: the phone's list, and nothing sideways.
	({ context, page, errors } = await open('surface=ledger&balance=1', { width: 390, height: 844 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="ledger-row"]');
	m = await measureLedger();
	check(
		'Ledger at 390px: the phone’s list, with nothing sideways',
		m.layout === 'phone' && m.head === null && m.overflow <= 0 && m.docOverflow <= 0,
		`layout ${m.layout}, rows overflow ${m.overflow}px, document ${m.docOverflow}px`
	);
	check('Ledger at 390px: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	// The operator's desk: the wide tracks, and the head still on the rows.
	({ context, page, errors } = await open('surface=ledger&balance=1', { width: 3360, height: 1400 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="ledger-row"]');
	m = await measureLedger();
	check(
		'Ledger at 3360px: the wide tracks, and the head on the rows',
		m.layout === 'wide' &&
			Math.abs(m.dateTrack - 112) < 1 &&
			m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5),
		`layout ${m.layout}, date track ${m.dateTrack.toFixed(1)}px`
	);
	check('Ledger at 3360px: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// ── The ledger's look for lists that are not money, and a record's page (radar-hooves/godswood, 08/10/2026) ──
// RecordList wears the Ledger's look, so the same layout facts are held: the
// head card's columns on the rows' to the pixel, nothing sideways at a phone's
// width, the wide-only columns arriving at the operator's 3360px desk. A
// record page's column holds one opened item that is as tall as what it holds
// up to the column and then scrolls inside itself; its document takes the
// column's place and stands beside it as a third pane once the page's row is
// 1250px wide, a 1600px screen with the rail open.
{
	const measureRecords = (page) =>
		page.evaluate(() => {
			const list = document.querySelector('[data-slot="record-list"]');
			const head = document.querySelector('[data-slot="record-head"]');
			const row = document.querySelector('[data-slot="record-row"]');
			const cells = (el) =>
				[...el.children].filter((c) => !c.matches('[data-slot="record-open"]')).map((c) => {
					const r = c.getBoundingClientRect();
					return [r.left, r.right];
				});
			const region = document.querySelector('[data-slot="app-shell-content"]');
			return {
				layout: list?.dataset.layout,
				listWidth: list?.getBoundingClientRect().width,
				heads: head ? [...head.children].map((c) => c.textContent.trim()) : null,
				headEdges: head ? cells(head) : [],
				rowEdges: row && head ? cells(row) : [],
				overflow: region.scrollWidth - region.clientWidth,
				docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
			};
		});

	let { context, page, errors } = await open('surface=records', { width: 1440, height: 900 }, 'light');
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="record-row"]');
	let m = await measureRecords(page);
	check(
		'RecordList at 1440px: the head card’s columns on the rows’, the wide-only columns held back',
		m.layout === 'narrow' &&
			JSON.stringify(m.heads) === JSON.stringify(['Property', 'Value', 'LVR', 'Rent / wk']) &&
			m.headEdges.length === m.rowEdges.length &&
			m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5),
		`layout ${m.layout}, heads ${JSON.stringify(m.heads)}, head ${JSON.stringify(m.headEdges)} vs row ${JSON.stringify(m.rowEdges)}`
	);
	check('RecordList at 1440px: nothing sideways', m.overflow <= 0 && m.docOverflow <= 0, `${m.overflow}px, document ${m.docOverflow}px`);
	// A row is a link; a module's control in a cell is its own.
	const target = await page.evaluate(() => {
		const row = document.querySelector('[data-slot="record-row"]');
		const r = row.getBoundingClientRect();
		return document.elementFromPoint(r.left + r.width * 0.6, (r.top + r.bottom) / 2)?.closest('a')?.getAttribute('href') ?? 'none';
	});
	check('RecordList: a click on a row’s cells reaches its link', target === '#/property/3', target);
	check('RecordList at 1440px: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	({ context, page, errors } = await open('surface=records&list=tools', { width: 1440, height: 900 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-probe="tool-run"]');
	await page.getByRole('button', { name: 'Open', exact: true }).click({ timeout: 3000 });
	check(
		'RecordList: a control in a module’s cell takes its own click',
		(await page.locator('[data-probe="tool-ran"]').textContent()) === 'split',
		await page.locator('[data-probe="tool-ran"]').textContent()
	);
	await context.close();

	({ context, page, errors } = await open('surface=records&list=managers', { width: 1440, height: 700 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="record-group"]');
	const held = await page.evaluate(() => {
		const rows = document.querySelector('[data-slot="record-rows"]');
		const head = document.querySelector('[data-slot="record-head"]');
		const before = head.getBoundingClientRect().top;
		rows.scrollTop = 200;
		const label = document.querySelector('[data-slot="record-group"]');
		const card = label.parentElement.nextElementSibling;
		return {
			scrolls: rows.scrollHeight > rows.clientHeight,
			drift: Math.abs(head.getBoundingClientRect().top - before),
			labelOutside: !label.closest('[data-slot="record-card"]') && card?.matches('[data-slot="record-card"]')
		};
	});
	check(
		'RecordList, grouped: its rows scroll under a head that stays, each label on the ground above its card',
		held.scrolls && held.drift < 0.5 && held.labelOutside,
		JSON.stringify(held)
	);
	check('RecordList, grouped: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	({ context, page, errors } = await open('surface=records', { width: 390, height: 844 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="record-row"]');
	m = await measureRecords(page);
	check(
		'RecordList at 390px: the phone’s list, with nothing sideways',
		m.layout === 'phone' && m.heads === null && m.overflow <= 0 && m.docOverflow <= 0,
		`layout ${m.layout}, overflow ${m.overflow}px, document ${m.docOverflow}px`
	);
	await context.close();

	// godswood, via the master-project orchestrator (app-factory#35): a 1280px
	// window with the rail open and the ContextColumn standing leaves the list
	// ~588px, which is a laptop's list, not a phone's.
	({ context, page, errors } = await open('surface=records', { width: 1280, height: 800 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="record-row"]');
	m = await measureRecords(page);
	const columnWidth = await page.evaluate(() => document.querySelector('[data-slot="context-column"]').getBoundingClientRect().width);
	check(
		'RecordList at 1280px beside the ContextColumn: the desktop layout, head card and columns',
		columnWidth >= 360 && m.listWidth < 600 && m.layout === 'narrow' && m.heads !== null && m.heads.length >= 4,
		`list ${m.listWidth}px, column ${columnWidth}px, layout ${m.layout}, heads ${JSON.stringify(m.heads)}`
	);
	await context.close();

	({ context, page, errors } = await open('surface=records', { width: 3360, height: 1400 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="record-row"]');
	m = await measureRecords(page);
	check(
		'RecordList at 3360px: the wide columns arrive, the heads still on the rows',
		m.layout === 'wide' &&
			m.heads.includes('Loan') &&
			m.heads.includes('Manager') &&
			m.headEdges.every(([l, r], i) => Math.abs(l - m.rowEdges[i][0]) < 0.5 && Math.abs(r - m.rowEdges[i][1]) < 0.5),
		`layout ${m.layout}, heads ${JSON.stringify(m.heads)}`
	);
	await context.close();

	// The record page.
	const measureRecord = (page) =>
		page.evaluate(() => {
			const box = (el) => {
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
			};
			const aside = document.querySelector('aside[data-slot="context-column"]');
			const item = aside?.querySelector('[data-slot="context-column-item"]');
			const body = item?.querySelector('[data-slot="panel-body"]');
			const third = document.querySelector('[data-slot="context-column-document"]');
			const pane = document.querySelector('[data-slot="document-pane"]');
			const pageImg = pane?.querySelector('img');
			const primary = aside?.previousElementSibling;
			const region = document.querySelector('[data-slot="app-shell-content"]');
			return {
				aside: box(aside),
				item: box(item),
				bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
				third: box(third),
				pane: box(pane),
				paneInAside: !!(pane && aside?.contains(pane)),
				page: box(pageImg),
				primary: box(primary),
				overflow: region.scrollWidth - region.clientWidth
			};
		});

	({ context, page, errors } = await open('surface=record', { width: 1440, height: 1100 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="context-column-item"]');
	let r = await measureRecord(page);
	check(
		'Record page, tall: the opened item is as tall as what it holds, short of the column',
		r.item && r.aside && r.item.height < r.aside.height - 20 && r.bodyScrolls === false,
		`item ${r.item?.height}px in a ${r.aside?.height}px column, scrolls ${r.bodyScrolls}`
	);
	await context.close();

	({ context, page, errors } = await open('surface=record', { width: 1440, height: 600 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="context-column-item"]');
	r = await measureRecord(page);
	check(
		'Record page, short: the opened item stops at the column and scrolls inside itself',
		r.item && r.aside && r.item.bottom <= r.aside.bottom + 0.5 && r.bodyScrolls === true,
		`item bottom ${r.item?.bottom} vs column ${r.aside?.bottom}, scrolls ${r.bodyScrolls}`
	);
	// A click on another section swaps the item; nothing in the left pane moves.
	const before = await page.evaluate(() => document.querySelector('[data-probe="sections"]').getBoundingClientRect().top);
	await page.getByRole('button', { name: 'Open Insurance' }).click();
	const swapped = await page.evaluate(() => ({
		title: document.querySelector('[data-slot="context-column-item"] h2')?.textContent?.trim(),
		top: document.querySelector('[data-probe="sections"]').getBoundingClientRect().top,
		current: document.querySelector('[data-slot="record-open"][aria-current="true"]')?.getAttribute('aria-label')
	}));
	check(
		'Record page: a click on a section swaps the column, marks the line, moves nothing else',
		swapped.title === 'Insurance' && swapped.current === 'Open Insurance' && Math.abs(swapped.top - before) < 0.5,
		JSON.stringify(swapped)
	);
	check('Record page: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	({ context, page, errors } = await open('surface=record&doc=1', { width: 1440, height: 900 }, 'dark'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="document-pane"] img');
	await page.waitForFunction(() => document.querySelector('[data-slot="document-pane"] img')?.getBoundingClientRect().width > 0);
	r = await measureRecord(page);
	check(
		'Record page at 1440px: the document takes the column’s place, fills it, its page fitted inside',
		r.paneInAside &&
			!r.third &&
			Math.abs(r.pane.height - r.aside.height) < 1 &&
			r.page.width > 0 &&
			r.page.left >= r.pane.left &&
			r.page.right <= r.pane.right &&
			r.page.bottom <= r.pane.bottom,
		JSON.stringify({ pane: r.pane, aside: r.aside, page: r.page })
	);
	await context.close();

	({ context, page, errors } = await open('surface=record&doc=1', { width: 1920, height: 1080 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="context-column-document"] img');
	r = await measureRecord(page);
	check(
		'Record page, a 1920px screen: the document is a third pane beside the column, the item kept',
		!r.paneInAside &&
			r.third &&
			r.item &&
			r.primary.right <= r.aside.left &&
			r.aside.right <= r.third.left &&
			r.third.width > r.aside.width &&
			r.overflow <= 0,
		JSON.stringify({ primary: r.primary, aside: r.aside, third: r.third, overflow: r.overflow })
	);
	check('Record page at 1920px: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();

	({ context, page, errors } = await open('surface=record', { width: 1440, height: 900 }, 'light'));
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-slot="record-switcher-trigger"]');
	const trigger = await page.evaluate(() => {
		const t = document.querySelector('[data-slot="record-switcher-trigger"]');
		const s = getComputedStyle(t);
		return { border: s.borderTopWidth, chevronInside: !!t.querySelector('svg') && t.querySelector('svg').getBoundingClientRect().right <= t.getBoundingClientRect().right };
	});
	await page.getByRole('button', { name: '4. Banksia: switch to another property' }).click();
	await page.waitForSelector('[data-slot="record-switcher-item"]');
	const menu = await page.evaluate(() => ({
		highlighted: document.querySelector('[data-slot="record-switcher-item"][aria-selected="true"]')?.textContent?.trim(),
		thumbs: document.querySelectorAll('[data-slot="record-switcher-item"] [data-slot="record-thumbnail"]').length,
		focused: document.activeElement?.getAttribute('role')
	}));
	check(
		'RecordSwitcher: a raised control with its chevron inside, opening on the open record with the search focused',
		trigger.border !== '0px' && trigger.chevronInside && menu.highlighted?.startsWith('4. Banksia') && menu.thumbs === 5 && menu.focused === 'combobox',
		JSON.stringify({ trigger, menu })
	);
	await page.keyboard.type('eum');
	await page.keyboard.press('Enter');
	const went = await page
		.waitForFunction(() => location.hash === '#/property/1', null, { timeout: 3000 })
		.then(() => true, () => false);
	check('RecordSwitcher: typed and chosen by keyboard, it goes to that record', went, await page.evaluate(() => location.hash));
	check('RecordSwitcher: no page error', errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// The shell's own chrome never takes a click meant for an app's control. Both
// were app CI failures on 04/10/2026: a crowded bar painted the next item over
// mission-command's workspace menu, and the report button sat on earworm's last
// control in a 180px-tall window. The bar's claim is Playwright's own
// actionability check, which refuses a control another element intercepts; the
// button's is geometric, since a round disc misses a control's centre by luck.
for (const [height, long] of [
	[720, 1],
	[180, 0]
]) {
	const { context, page, errors } = await open(`surface=chrome&long=${long}`, { width: 1280, height });
	await page.addStyleTag({ content: SETTLE });
	await page.waitForSelector('[data-testid="chrome-context"]');
	const target = await page
		.getByTestId('chrome-context')
		.click({ trial: true, timeout: 3000 })
		.then(
			() => 'clickable',
			(error) => error.message.match(/<[^>]+> (from .+ subtree )?intercepts pointer events/)?.[0] ?? error.message.split('\n')[0]
		);
	check(`chrome at 1280x${height}: a crowded bar leaves the context control its own`, target === 'clickable', target);
	const shared = await page.evaluate(() => {
		const main = document.querySelector('[data-slot="app-shell-content"]');
		main.scrollTop = main.scrollHeight;
		const a = document.querySelector('[data-testid="chrome-last"]').getBoundingClientRect();
		const b = document.querySelector('[aria-label="Report a problem"]').getBoundingClientRect();
		const across = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
		const down = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
		return Math.round(across * down);
	});
	check(`chrome at 1280x${height}: scrolled to its end, the last control clears the report button`, shared === 0, `${shared}px² shared`);
	check(`chrome at 1280x${height}: no page error`, errors.length === 0, JSON.stringify(errors));
	await context.close();
}

// Desktop presentation: assert copied content and failure outcomes, not screenshots.
for (const [label, viewport, theme, scale, rtl] of [
	['landscape light', { width: 1440, height: 900 }, 'light', 1, false],
	['landscape dark', { width: 1440, height: 900 }, 'dark', 1, false],
	['portrait light', { width: 900, height: 1440 }, 'light', 1, false],
	['portrait dark', { width: 900, height: 1440 }, 'dark', 1, false],
	['large text', { width: 900, height: 1440 }, 'light', 2, false],
	['RTL', { width: 1440, height: 900 }, 'dark', 1, true]
]) {
	const { context, page, errors } = await open('surface=desktop-about', viewport, theme);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.evaluate(({ scale, rtl }) => {
		document.documentElement.style.fontSize = `${scale * 100}%`;
		document.documentElement.dir = rtl ? 'rtl' : 'ltr';
	}, { scale, rtl });
	const copy = page.getByRole('button', { name: 'Copy diagnostics' });
	await copy.focus();
	check(`About keyboard focus (${label})`, await copy.evaluate((node) => node === document.activeElement), 'copy control focused');
	await copy.hover();
	await copy.press('Enter');
	await page.getByText('Diagnostics copied', { exact: true }).waitFor();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	check(`About copies explicit diagnostics (${label})`,
		copied === 'Desktop fixture\nVersion: 2026.10.11\nPlatform: macOS\nTelemetry: Off', 'exact fixture fields');
	const link = page.getByRole('link', { name: 'Project', exact: true });
	check(`About external link (${label})`, (await link.getAttribute('rel')) === 'noopener noreferrer', 'isolated new tab');
	await page.getByRole('button', { name: 'Long error' }).click();
	const description = page.locator('[data-sonner-toast] [data-description]').filter({ hasText: 'Cannot reach collector.' });
	await description.waitFor();
	await page.waitForFunction(() => {
		const toast = [...document.querySelectorAll('[data-sonner-toast]')].find((node) => node.textContent.includes('Connection failed'));
		if (!toast) return false;
		const box = toast.getBoundingClientRect();
		return box.top >= 0 && box.bottom <= innerHeight && getComputedStyle(toast).opacity === '1';
	});
	const geometry = await description.evaluate((node) => {
		const box = node.getBoundingClientRect();
		const style = getComputedStyle(node);
		return { fits: box.left >= 0 && box.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1,
			wrap: style.overflowWrap, lines: node.textContent.includes('\n') && style.whiteSpace === 'pre-wrap',
			font: Number.parseFloat(style.fontSize), tokenColour: style.color === getComputedStyle(node.closest('[data-sonner-toast]')).color };
	});
	check(`Toast wraps long diagnostics (${label})`, geometry.fits && geometry.wrap === 'anywhere' && geometry.lines && geometry.font >= 13 * scale && geometry.tokenColour, JSON.stringify(geometry));
	const readable = await description.evaluate((node) => {
		const body = node.closest('[data-content]');
		body.scrollTop = body.scrollHeight;
		const readable = body.scrollHeight <= body.clientHeight + 1 || body.scrollTop > 0;
		body.scrollTop = 0;
		return readable;
	});
	check(`Toast overflow stays readable (${label})`, readable, 'bounded content scrolls when needed');
	await page.screenshot({ path: join(root, `desktop-about-${label.replaceAll(' ', '-')}.png`) });
	await page.locator('[data-sonner-toast]').filter({ hasText: 'Connection failed' }).locator('[data-close-button]').click();
	await description.waitFor({ state: 'hidden' });
	await page.evaluate(() => {
		Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('fixture denial')) });
	});
	await copy.focus();
	await copy.press('Enter');
	await page.getByText('Could not copy diagnostics', { exact: true }).waitFor();
	check(`About clipboard failure (${label})`, await page.getByText('Clipboard access is unavailable.', { exact: true }).isVisible(), 'failure surfaced');
	check(`Desktop presentation runtime (${label})`, errors.length === 0, `${errors.length} page errors`);
	await context.close();
}

{
	const { context, page } = await open('surface=desktop-about&clipboard=host');
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', { get: () => { throw new Error('browser clipboard unavailable'); } });
	});
	await page.getByRole('button', { name: 'Copy diagnostics' }).click();
	await page.getByText('Diagnostics copied', { exact: true }).waitFor();
	check('About supports host clipboard API', (await page.locator('[data-probe="host-clipboard"]').textContent()) ===
		'Desktop fixture\nVersion: 2026.10.11\nPlatform: macOS\nTelemetry: Off', 'host writer receives explicit fields without browser clipboard');
	await context.close();
}

await browser.close();
await webkitBrowser.close();
server.close();

for (const { name, ok, detail } of checks) {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`);
}
console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
if (failures.length > 0) {
	console.error(`\n${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
	process.exit(1);
}
