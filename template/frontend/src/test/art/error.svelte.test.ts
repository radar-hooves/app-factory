/**
 * The protected error page with and without an app's `ErrorArt` (self-test only).
 */
import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
	status: 404,
	error: null as { message: string } | null
}));
const art = vi.hoisted(() => ({ ErrorArt: undefined as unknown }));

vi.mock('$app/state', () => ({ page: nav }));
vi.mock('$lib/art', () => ({
	get ErrorArt() {
		return art.ErrorArt;
	}
}));

import ErrorPage from '../../routes/(protected)/+error.svelte';
import ErrorArt from './ErrorArt.svelte';

beforeEach(() => {
	nav.status = 404;
	nav.error = null;
	art.ErrorArt = undefined;
});

describe('the protected error page', () => {
	it('draws only its words when the app supplies no art', () => {
		render(ErrorPage);

		expect(screen.getByText('Page not found')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go home' })).toBeInTheDocument();
		expect(screen.queryByTestId('error-art')).toBeNull();
	});

	it("draws the app's art, given the status and message, above the same words", () => {
		art.ErrorArt = ErrorArt;
		nav.status = 500;
		nav.error = { message: 'The kettle broke' };
		render(ErrorPage);

		expect(screen.getByTestId('error-art')).toHaveAccessibleName('Art for 500: The kettle broke');
		expect(screen.getByText('This page could not open')).toBeInTheDocument();
		expect(screen.getByText('The kettle broke')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go home' })).toBeInTheDocument();
	});
});
