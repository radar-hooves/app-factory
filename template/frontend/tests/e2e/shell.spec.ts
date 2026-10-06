import { expect, test, type Locator } from '@playwright/test';

// The shell's own spec, and unlike example.spec.ts it is NOT the scaffold's to
// delete: it drives the one piece of chrome canonical-app-shape.md requires of
// every app and that four apps had each wired for themselves
// (full-stack-app-template#23).
//
// It asserts the OUTCOME, not the render: clicking the top bar's affordance must
// actually open the palette. A search button wired to nothing looks identical in
// a screenshot, which is how three apps shipped a top bar with no search at all
// without anything going red.
test('the top bar search affordance opens the command palette', async ({ page }) => {
	await page.goto('/');

	// The shared shell's own test id, so this spec does not depend on the label
	// an app chooses for its search button.
	await page.getByTestId('ds-shell-search').click();

	await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
	// The palette's own input, so a dialog opened by something else cannot pass.
	await expect(page.getByPlaceholder('Search…')).toBeFocused();
});

// Every route the factory stamps sits under routes/(protected)/, so it renders inside
// this app's own frame and behind the session guard with no move, whatever the
// app has put in the frame (app-factory#6). Each case waits for the page's own
// heading INSIDE the shell's main landmark: the frame also renders around the
// loading state, so the chrome alone would pass before the page ever did.
const STAMPED_ROUTES = [
	{ path: '/workspace', heading: 'Members' },
	{ path: '/settings/application', heading: 'Application' },
	{ path: '/rooms', heading: 'Ask' }
];

for (const { path, heading } of STAMPED_ROUTES) {
	test(`the factory's ${path} renders inside the app's shell`, async ({ page }) => {
		await page.goto(path);

		await expect(
			page.locator('#ds-main').getByRole('heading', { name: heading, exact: true })
		).toBeVisible();
		await expect(page.getByTestId('ds-shell-search')).toBeVisible();
	});
}

// The shell's chrome sits on none of the app's controls, asked of this app's own
// frame on a phone and a desktop. It did three ways: the report button on a
// room's Send at 390x844 (app-factory#29) and on earworm's last control, and a
// crowded top bar over mission-command's workspace menu. A control's trial click
// fails naming whatever would take the click instead. The household's E2E widths
// (stacks/sveltekit-testing.md), and 1280, where a crowded bar overlapped.
const VIEWPORTS = [
	{ width: 375, height: 812 },
	{ width: 768, height: 1024 },
	{ width: 1280, height: 720 },
	{ width: 1920, height: 1080 }
];

async function expectEachTakesItsClick(controls: Locator) {
	for (const control of await controls.filter({ visible: true }).all()) {
		if (await control.isEnabled()) await control.click({ trial: true });
	}
}

for (const viewport of VIEWPORTS) {
	const size = `${viewport.width}x${viewport.height}`;

	for (const { path, heading } of STAMPED_ROUTES) {
		test(`nothing of the shell covers a control on ${path} at ${size}`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await page.goto(path);
			const main = page.locator('#ds-main');
			await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible();

			for (const region of [page.getByRole('banner'), main]) {
				await expectEachTakesItsClick(region.getByRole('button'));
				await expectEachTakesItsClick(region.getByRole('link'));
			}
		});
	}

	// A page's last control, a Button's height at its right edge below more page
	// than the window holds, is where the report button floats; the padded page
	// ends with room to scroll it clear.
	test(`a page's last control scrolls clear of the report button at ${size}`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto('/workspace');
		const main = page.locator('#ds-main');
		await expect(main.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
		await main.evaluate((region) => {
			const row = document.createElement('div');
			row.style.cssText = 'display: flex; justify-content: flex-end; padding-top: 150vh';
			const last = document.createElement('button');
			last.textContent = 'Last';
			last.dataset.testid = 'last-control';
			last.style.height = '2.5rem';
			row.append(last);
			(region.firstElementChild ?? region).append(row);
		});

		await page.getByTestId('last-control').click({ trial: true });
	});
}

// A URL nothing serves is still a signed-in page: the shell stays, so the rail
// is there to leave by, and the session guard still ran.
test('an address no route serves renders inside the shell', async ({ page }) => {
	await page.goto('/no-route-serves-this');

	await expect(
		page.locator('#ds-main').getByRole('heading', { name: 'Page not found' })
	).toBeVisible();
});

// A link to what the backend serves (a download under /api, the API itself)
// leaves the SPA for a full page load. The catch-all behind "Page not found"
// must not claim it; the link sits inside the page, where the router listens.
test('a link to the API leaves the app for the API', async ({ page }) => {
	await page.goto('/workspace');
	await expect(page.locator('#ds-main').getByRole('heading', { name: 'Members' })).toBeVisible();
	await page.locator('#ds-main').evaluate((main) => {
		const link = document.createElement('a');
		link.href = '/api/system/health';
		link.dataset.testid = 'api-link';
		link.textContent = 'health';
		main.append(link);
	});

	await page.getByTestId('api-link').click();

	await expect(page).toHaveURL(/\/api\/system\/health$/);
	await expect(page.locator('#ds-main')).toHaveCount(0);
});

// The rail's own Settings row goes to /settings, which must be a page: the
// first settings page this caller can open, or the destination saying there is
// none. Which one depends on the app and the caller; a 404 is never right.
test("the rail's Settings row lands on a page", async ({ page }) => {
	await page.goto('/settings');

	const heading = page.locator('#ds-main').getByRole('heading').first();
	await expect(heading).toBeVisible();
	await expect(heading).not.toHaveText('Page not found');
});
