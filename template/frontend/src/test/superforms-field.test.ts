import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import SuperformsField from './superforms-field.svelte';

/**
 * The real SvelteKit `page` holds each field as `$state.raw`, so what a form
 * puts in it comes back as the plain value. A deep-proxied mock hands formsnap
 * a Proxy, and its `structuredClone` of the errors throws DataCloneError, so no
 * field error renders.
 */
describe('the $app/state page mock with superforms 3', () => {
	it('shows a field error after a failed client validation', async () => {
		render(SuperformsField);
		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.getByText('Title is required')).toBeInTheDocument());
	});
});
