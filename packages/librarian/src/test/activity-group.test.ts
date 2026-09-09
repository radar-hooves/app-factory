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
			collections: ['household-legal'],
			documents: 2,
			searches: 1
		};

		render(ActivityGroup, { props: { group, live: false } });

		expect(screen.getByText('1 search · 2 documents read')).toBeInTheDocument();
		expect(screen.queryByText(/collection/i)).not.toBeInTheDocument();
	});
});
