// The browser half of proof.sh: <selftest-card> on the service's own page and
// on the placing app's, light and dark. Each must draw the kit in the palette of
// the page it is on and read its own app's API as the viewer; a signed-out read
// must make one sign-in hop and come back. Prints every reading beside its
// verdict; SHOTS=<dir> also keeps a screenshot of each, which corroborates and
// asserts nothing.
import { createRequire } from 'node:module';

const { SERVICE_URL, PLACER_URL, FRONTEND, SHOTS } = process.env;
const { chromium } = createRequire(`${FRONTEND}/package.json`)('@playwright/test');
const { hostChromium } = await import(`${FRONTEND}/tests/e2e/host-browser.ts`);

let failures = 0;
function check(name, ok, observed) {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(observed)}`);
	if (!ok) failures += 1;
}

// What the element reads, asked of the service directly.
const READ = '/api/system/database-environment';
const { environment } = await (await fetch(`${SERVICE_URL}${READ}`)).json();
const read = `Read from its app: ${environment}`;

const placements = [
	{ name: 'service', url: SERVICE_URL, scope: 'On its own page', count: 0 },
	{ name: 'placer', url: PLACER_URL, scope: 'Placed in factory-placer', count: 3 }
];
const primaries = {};
// No zygote: the runner's unit forbids capset, which the zygote calls, and the
// browser dies on its first page (measured 17/10/2026).
const browser = await chromium.launch({ executablePath: hostChromium(), args: ['--no-zygote'] });
for (const { name, url, scope, count } of placements) {
	for (const colorScheme of ['light', 'dark']) {
		const at = `${name} ${colorScheme}`;
		const page = await browser.newPage({ colorScheme });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
		// The page's own browser telemetry, which the front door collects in production.
		await page.route('**/faro/collect', (route) => route.fulfill({ status: 204 }));
		await page.goto(`${url}/proof`);
		await page.getByTestId('read').filter({ hasText: 'Read from' }).waitFor({ timeout: 15_000 });
		if (colorScheme === 'dark') await page.locator('selftest-card[data-dark]').waitFor();
		const seen = await page.evaluate(() => {
			const host = document.querySelector('selftest-card');
			const shadow = host.shadowRoot;
			// The page's own primary, resolved the way any of its own rules would.
			const probe = document.createElement('div');
			probe.style.backgroundColor = 'var(--ds-color-primary)';
			document.body.append(probe);
			const primary = getComputedStyle(probe).backgroundColor;
			probe.remove();
			const card = getComputedStyle(shadow.querySelector('[data-slot=card]'));
			return {
				primary,
				button: getComputedStyle(shadow.querySelector('[data-testid=primary]')).backgroundColor,
				ring: card.boxShadow,
				font: [card.fontFamily, getComputedStyle(document.body).fontFamily],
				dark: getComputedStyle(shadow.querySelector('[data-testid=dark]')).display === 'block',
				count: host.count,
				read: shadow.querySelector('[data-testid=read]').textContent.trim(),
				text: shadow.textContent.replace(/\s+/g, ' ').trim()
			};
		});
		check(`${at}: the kit's button takes the page's primary`, seen.button === seen.primary, [seen.button, seen.primary]);
		check(`${at}: the card's ring draws`, seen.ring !== 'none', seen.ring);
		check(`${at}: the card sets in the page's body face`, seen.font[0] === seen.font[1], seen.font);
		check(`${at}: the kit's dark: variant follows the page's mode`, seen.dark === (colorScheme === 'dark'), seen.dark);
		check(`${at}: scoped by its attribute`, seen.text.includes(scope), seen.text);
		check(`${at}: a declared Number attribute arrives as a number`, seen.count === count, seen.count);
		check(`${at}: reads its own app's API as the viewer`, seen.read === read, seen.read);
		check(`${at}: no page or console error`, errors.length === 0, errors);
		primaries[at] = seen.primary;

		// The display face: the token names a family the page's own @font-face
		// registered, and the browser has loaded it for the element's heading.
		const face = await page.evaluate(async () => {
			const heading = document.querySelector('selftest-card').shadowRoot.querySelector('[data-testid=display]');
			await document.fonts.ready;
			const loaded = [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family);
			return { stack: getComputedStyle(heading).fontFamily, loaded };
		});
		check(
			`${at}: the display face names the family the page registered, and it loaded`,
			face.stack.includes('Fraunces Variable') && face.loaded.some((family) => family.includes('Fraunces')),
			face
		);

		// A pop-over: opened inside the shadow root, so it keeps the kit's stylesheet,
		// and drawn in the page's surface, not the browser's default.
		await page.locator('selftest-card [data-testid=open]').click();
		await page.locator('[data-testid=popover]').waitFor();
		const popover = await page.evaluate(() => {
			const host = document.querySelector('selftest-card');
			const pop = document.querySelector('[data-testid=popover]') ?? host.shadowRoot.querySelector('[data-testid=popover]');
			const probe = document.createElement('div');
			probe.style.backgroundColor = 'var(--ds-color-surface-3)';
			document.body.append(probe);
			const surface = getComputedStyle(probe).backgroundColor;
			probe.remove();
			const style = getComputedStyle(pop);
			return {
				background: style.backgroundColor,
				surface,
				radius: style.borderTopLeftRadius,
				border: style.borderTopStyle,
				inShadow: pop.getRootNode() === host.shadowRoot,
				width: pop.getBoundingClientRect().width
			};
		});
		check(
			`${at}: a pop-over opens inside the shadow root, in the page's surface`,
			popover.inShadow && popover.background === popover.surface && popover.radius !== '0px' && popover.border === 'solid',
			popover
		);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}.png` });
		await page.close();
	}
}
check(
	'two pages, two palettes, one element',
	primaries['service light'] !== primaries['placer light'] && primaries['service dark'] !== primaries['placer dark'],
	primaries
);

// The sign-in hop, with the service's real /elements/session: the read is
// refused the way forward-auth refuses a browser with no session there (a
// redirect carrying no CORS headers), `refusals` times, then let through.
async function hop(refusals) {
	const page = await browser.newPage();
	let refused = 0;
	const hops = [];
	page.on('request', (request) => request.isNavigationRequest() && request.url().includes('/elements/session') && hops.push(request.url()));
	await page.route(`${SERVICE_URL}${READ}`, (route) =>
		refused++ < refusals ? route.fulfill({ status: 401 }) : route.continue()
	);
	await page.goto(`${PLACER_URL}/proof`);
	const settled = page.getByTestId('read').filter({ hasText: refusals > 1 ? 'Not signed in' : 'Read from' });
	await settled.waitFor({ timeout: 15_000 });
	const seen = { hops: hops.length, url: page.url(), read: (await settled.textContent()).trim() };
	await page.close();
	return seen;
}
const once = await hop(1);
check(
	'signed out once: one hop through the service, back to the same page, and the read succeeds',
	once.hops === 1 && once.url === `${PLACER_URL}/proof` && once.read === read,
	once
);
const always = await hop(Infinity);
check(
	'signed out again straight after the hop: final, offered by hand, never a second hop',
	always.hops === 1 && always.url === `${PLACER_URL}/proof` && always.read.startsWith('Not signed in'),
	always
);

// A household page registers Tailwind's @property rules itself, which hides
// whether the element does: a shadow root ignores its own. A bare page has none.
const bare = await browser.newPage();
await bare.route(`${SERVICE_URL}/bare`, (route) =>
	route.fulfill({
		contentType: 'text/html',
		body: '<!doctype html><selftest-card></selftest-card><script type="module" src="/elements.js"></script>'
	})
);
await bare.goto(`${SERVICE_URL}/bare`);
await bare.locator('selftest-card [data-testid=primary]').waitFor({ timeout: 15_000 });
const registered = await bare.evaluate(() => {
	const shadow = document.querySelector('selftest-card').shadowRoot;
	return [
		getComputedStyle(shadow.querySelector('[data-slot=card]')).boxShadow,
		getComputedStyle(shadow.querySelector('[data-testid=primary]')).borderTopStyle
	];
});
check(
	"a bare page: the element registers the kit's @property values the shadow root cannot",
	registered[0] !== 'none' && registered[1] === 'solid',
	registered
);

// The kit's control sizes are declared at :root, which a shadow root does not
// match. A bare page declares none, so the element must carry the default
// (a 2.5rem button); a page that sets its own, here the compact ramp's, still wins.
for (const [density, height] of [[null, 40], ['compact', 32]]) {
	const page = await browser.newPage();
	await page.route(`${SERVICE_URL}/bare`, (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: `<!doctype html>${density ? '<style>:root{--ds-control-height-md:2rem}</style>' : ''}<selftest-card></selftest-card><script type="module" src="/elements.js"></script>`
		})
	);
	await page.goto(`${SERVICE_URL}/bare`);
	await page.locator('selftest-card [data-testid=primary]').waitFor({ timeout: 15_000 });
	const sized = await page.evaluate(() => {
		const button = document.querySelector('selftest-card').shadowRoot.querySelector('[data-testid=primary]');
		return getComputedStyle(button).height;
	});
	check(`a bare page${density ? ` in ${density} density` : ''}: the kit's button is ${height}px tall`, sized === `${height}px`, sized);
	if (!density) {
		// A pop-over on a page with none of the kit's CSS: only a layer inside the shadow root has it.
		await page.locator('selftest-card [data-testid=open]').click();
		await page.locator('[data-testid=popover]').waitFor();
		const pop = await page.evaluate(() => {
			const popover =
				document.querySelector('[data-testid=popover]') ??
				document.querySelector('selftest-card').shadowRoot.querySelector('[data-testid=popover]');
			const style = getComputedStyle(popover);
			return { padding: style.paddingTop, inShadow: popover.getRootNode() instanceof ShadowRoot };
		});
		check('a bare page: a pop-over keeps the kit stylesheet', pop.inShadow && pop.padding === '16px', pop);
	}
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/bare-${density ?? 'default'}.png` });
	await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
