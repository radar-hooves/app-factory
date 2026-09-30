import { expect, test, type Page } from '@playwright/test';

// app-factory#15: at 1280px the shell's fixed "Report a problem" trigger sat
// over the room composer's Send control, and Playwright's own click on Send
// was intercepted by the trigger's subtree. Reproduced and driven here
// against room-check/+page.svelte, which composes the real AppShell,
// ReportWidget and librarian Composer exactly as a stamped app does — the
// fix lives in those two shared packages, not in the room page itself
// (unmerged, on foreman/wt-5dbff3eb), so this proves it without that page.
//
// 1440 and 390 are driven too, and this fixture carries no per-page class of
// its own at any width: the shared-package fix (ReportWidget reading
// `--ds-report-clearance`, the librarian Conversation setting it) is what
// keeps all three green, on its own.
const WIDTHS = [1280, 1440, 390];

async function askAndSend(page: Page) {
	const composer = page.getByRole('textbox');
	await composer.click();
	await composer.fill('Does the shell still cover Send?');

	const send = page.getByRole('button', { name: 'Send' });
	const report = page.getByRole('button', { name: 'Report a problem' });
	await expect(send).toBeVisible();
	await expect(report).toBeVisible();

	// The geometric claim itself, independent of whether the click below
	// happens to land: the shell's trigger must not occupy any of the same
	// screen space as the composer's primary action. Polled rather than read
	// once: the librarian Conversation claims `--ds-report-clearance` from an
	// `$effect`, a tick after mount, so a box read on the same frame as
	// `goto()` can catch the trigger still at its pre-clearance position.
	await expect
		.poll(
			async () => {
				const [sendBox, reportBox] = await Promise.all([send.boundingBox(), report.boundingBox()]);
				if (!sendBox || !reportBox) return 'no-box';
				const overlaps =
					sendBox.x < reportBox.x + reportBox.width &&
					sendBox.x + sendBox.width > reportBox.x &&
					sendBox.y < reportBox.y + reportBox.height &&
					sendBox.y + sendBox.height > reportBox.y;
				return overlaps;
			},
			{ message: 'Send and the report trigger occupy overlapping screen space' }
		)
		.toBe(false);

	// The outcome, not just the geometry: a click Playwright's own
	// actionability check would refuse (intercepted by the trigger's
	// subtree) throws before this line is reached. `Chat.ask()` clears the
	// draft immediately, so an emptied box is Send having actually fired —
	// the report dialogue opening instead would leave it untouched.
	await send.click();
	await expect(composer).toHaveValue('');
	await expect(page.getByRole('dialog', { name: 'Report a problem' })).not.toBeVisible();
}

for (const width of WIDTHS) {
	test(`Send is clickable, not covered by the report trigger, at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 720 });
		await page.goto('/room-check');
		await askAndSend(page);
	});
}
