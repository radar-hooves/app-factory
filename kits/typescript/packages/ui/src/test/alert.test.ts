import { describe, expect, it } from 'vitest';
import { alertVariants } from '$lib/components/ui/alert/alert.svelte';

describe('alertVariants', () => {
	it('warning is built from the status-warning token', () => {
		const cls = alertVariants({ variant: 'warning' });
		expect(cls).toContain('border-status-warning/50');
		expect(cls).toContain('[&>svg]:text-status-warning');
	});
});
