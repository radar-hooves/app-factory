import { existsSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

import { chromium } from '@playwright/test';

import { hostChromium } from './host-browser';

/**
 * Pays Vite's compile cost before the first timed spec.
 *
 * `vite dev` serves a page module by module and transforms each on first
 * request, so the first visit to a heavy route took seconds inside a 5 s
 * `expect` budget and failed once, then passed on a rerun. The transform cache
 * lives in the server, so one real browser visit per static route spends the
 * cost here, once, and every spec after it meets a warm server. A Node `fetch`
 * cannot do this: it gets the HTML and never runs the imports that cost.
 *
 * Routes come from `src/routes`: every directory holding a `+page.svelte`, route
 * groups `(x)` dropped, parameterised ones (`[id]`) skipped since no id is known.
 * Best effort: a route that errors, redirects or never idles has cost nothing.
 */
export function staticRoutes(root = join('src', 'routes'), rel = ''): string[] {
	if (!existsSync(root)) return [];
	const routes = readdirSync(join(root, rel), { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() && !entry.name.includes('[')
			? staticRoutes(root, join(rel, entry.name))
			: []
	);
	if (existsSync(join(root, rel, '+page.svelte'))) {
		routes.push(
			'/' +
				rel
					.split(sep)
					.filter((part) => part && !/^\(.*\)$/.test(part))
					.join('/')
		);
	}
	return routes;
}

export async function warmRoutes(baseURL: string): Promise<void> {
	const routes = [...new Set(staticRoutes())];
	if (!routes.length) return;
	let browser;
	try {
		browser = await chromium.launch({ executablePath: hostChromium() });
		const page = await browser.newPage();
		for (const route of routes) {
			try {
				await page.goto(new URL(route, baseURL).toString(), { timeout: 60_000 });
				await page.waitForLoadState('networkidle', { timeout: 20_000 });
			} catch {
				// Warming is an optimisation; the spec that needs the route will say so.
			}
		}
	} catch {
		// No browser to launch is the specs' problem to report, not the warm-up's.
	} finally {
		await browser?.close();
	}
}
