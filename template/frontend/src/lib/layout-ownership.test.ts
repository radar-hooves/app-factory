import { describe, expect, it } from 'vitest';

import { findViolations } from '../../scripts/check-layout-ownership.mjs';

// The gate over this app's own source, in the unit leg every app runs: an app
// carrying a layout of its own (shell markup, its own page width or columns, a
// pageType the factory does not have) fails here. It is not the app's to edit
// or delete; `pnpm lint:layout` runs the same check.
describe('the app carries no layout of its own', () => {
	it('composes the factory shell, sizes no page itself, and declares only the factory’s page types', () => {
		const findings = findViolations();
		expect(findings.map((f) => `${f.rule} ${f.file}: ${f.detail}`)).toEqual([]);
	});
});
