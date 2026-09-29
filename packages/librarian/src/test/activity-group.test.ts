import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ActivityGroup from '$lib/components/activity-group/activity-group.svelte';
import type { ActivityGroup as ActivityGroupType } from '$lib/transcript.svelte';

describe('ActivityGroup summary line', () => {
	it('reads as counts of searches and documents, never a collection count', () => {
		const group: ActivityGroupType = {
			kind: 'activity',
			index: 0,
			steps: [],
			tallies: [
				{ one: 'search', many: 'searches', count: 1 },
				{ one: 'document read', many: 'documents read', count: 2 }
			]
		};

		render(ActivityGroup, { props: { group, live: false } });

		expect(screen.getByText('1 search · 2 documents read')).toBeInTheDocument();
		expect(screen.queryByText(/collection/i)).not.toBeInTheDocument();
	});
});
