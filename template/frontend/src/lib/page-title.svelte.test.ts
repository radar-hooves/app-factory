import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';

import { dynamicPageTitle, usePageTitle } from './page-title.svelte';

describe('usePageTitle', () => {
	it('shows the title once the data resolves and drops it when the page is left', () => {
		let name = $state<string | undefined>(undefined);
		const stop = $effect.root(() => usePageTitle(() => name));
		flushSync();
		expect(dynamicPageTitle()).toBeUndefined();

		name = 'Mq 28a';
		flushSync();
		expect(dynamicPageTitle()).toBe('Mq 28a');

		stop();
		expect(dynamicPageTitle()).toBeUndefined();
	});

	it('does not let a leaving page clear the title of the page that replaced it', () => {
		const stopOld = $effect.root(() => usePageTitle(() => 'Old'));
		flushSync();
		const stopNew = $effect.root(() => usePageTitle(() => 'New'));
		flushSync();
		stopOld();
		expect(dynamicPageTitle()).toBe('New');
		stopNew();
	});
});
