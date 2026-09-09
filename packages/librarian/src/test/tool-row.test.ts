import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ToolRow from '$lib/components/tool-row/tool-row.svelte';
import type { ToolBlock } from '$lib/transcript.svelte';

describe('ToolRow', () => {
	it('says what Milton did, never the tool name or the raw path — even expanded', async () => {
		const block: ToolBlock = {
			kind: 'tool',
			index: 0,
			name: 'Read',
			rawInput: JSON.stringify({ file_path: '/data/staged/pacman-division-2/page-001.md' }),
			result: 'Division 2 covers leave entitlements for permanent staff.'
		};

		const { container } = render(ToolRow, { props: { block, running: false } });

		expect(screen.getByText('Read')).toBeInTheDocument();
		expect(screen.getByText('pacman division 2')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button'));

		expect(container.textContent).not.toContain('/data/staged');
		expect(container.textContent).not.toContain('page-001');
		expect(container.textContent).not.toContain('file_path');
	});
});
