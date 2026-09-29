import { expect, test } from '@playwright/test';

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

// Every route the factory stamps sits under routes/(app)/, so it renders inside
// this app's own frame and behind the session guard with no move, whatever the
// app has put in the frame (app-factory#6). Each case waits for the page's own
// heading INSIDE the shell's main landmark: the frame also renders around the
// loading state, so the chrome alone would pass before the page ever did.
const STAMPED_ROUTES = [
	{ path: '/workspace', heading: 'Members' },
	{ path: '/settings/application', heading: 'Application' },
	{ path: '/agent/no-such-persona', heading: 'No such persona' }
];

for (const { path, heading } of STAMPED_ROUTES) {
	test(`the factory's ${path} renders inside the app's shell`, async ({ page }) => {
		await page.goto(path);

		await expect(page.locator('#ds-main').getByRole('heading', { name: heading })).toBeVisible();
		await expect(page.getByTestId('ds-shell-search')).toBeVisible();
	});
}
