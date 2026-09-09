/**
 * The scope chip renders only when there is a genuine pick between two or
 * more scopes (design-system, the fixed-scope Composer defect). A room with
 * one shelf set passes neither `documentName` nor `collectionName`, leaving
 * "The whole library" as the sole entry — and a sole entry is console
 * furniture, not a control.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Composer from '$lib/components/composer/composer.svelte';

describe('Composer scope chip', () => {
	it('renders nothing when the caller has fixed the scope', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.queryByText('The whole library')).not.toBeInTheDocument();
	});

	it('renders chips once a narrower scope is offered', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				collectionName: 'household-legal',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.getByText('The whole library')).toBeInTheDocument();
		expect(screen.getByText('household-legal')).toBeInTheDocument();
	});
});

describe('Composer placeholder', () => {
	it('asks Milton by name, never a bare "ask anything"', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.getByPlaceholderText('Ask Milton…')).toBeInTheDocument();
	});
});
