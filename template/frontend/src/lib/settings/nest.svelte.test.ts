import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SchemaForm from '@poodle64/ui/schema-form';
import { nestSchema, nestValues, settingsLayout } from './nest';

describe('SchemaForm over a nested settings document', () => {
	it('shows every dotted setting with its value', () => {
		const schema = nestSchema({
			type: 'object',
			properties: {
				'example.enabled': { type: 'boolean', title: 'Enabled' },
				'example.limit': { type: 'integer', title: 'Limit', minimum: 1, maximum: 100 }
			}
		});
		render(SchemaForm, {
			schema,
			uischema: settingsLayout(schema),
			value: nestValues({ 'example.enabled': true, 'example.limit': 20 }),
			onChange: () => {}
		});

		expect(screen.getByText('Example')).toBeInTheDocument();
		expect(screen.getByRole('switch', { name: 'Enabled' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('spinbutton', { name: 'Limit' })).toHaveValue(20);
	});
});
