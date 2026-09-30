// <SchemaForm> rendering a non-trivial nested schema: a Group, a nested
// HorizontalLayout, five widget kinds, and two SHOW rules at different depths.
//
// The rules are the reason JSON Forms was chosen over RJSF at all — the
// upstream config models carry 36 conditional-visibility rules — so a rule that
// evaluates but does not actually change what is on screen would make the whole
// choice pointless. Every assertion below is about the DOM, not about a
// returned boolean.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Harness from './schema-form.svelte';

const schema = {
	type: 'object',
	required: ['name'],
	properties: {
		name: { type: 'string', title: 'Display name', description: 'Shown in the console.' },
		enabled: { type: 'boolean', title: 'Enabled' },
		engine: { type: 'string', title: 'Engine', enum: ['ollama', 'bedrock'] },
		notes: { type: 'string', title: 'Notes' },
		tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
		tuning: {
			type: 'object',
			title: 'Tuning',
			properties: {
				depth: { type: 'integer', title: 'Depth', minimum: 1, maximum: 10 },
				temperature: { type: 'number', title: 'Temperature', minimum: 0, maximum: 2 },
				endpoint: { type: 'string', title: 'Endpoint' }
			}
		}
	}
};

const uischema = {
	type: 'VerticalLayout',
	elements: [
		{ type: 'Control', scope: '#/properties/name' },
		{ type: 'Control', scope: '#/properties/enabled' },
		{ type: 'Control', scope: '#/properties/engine' },
		{ type: 'Control', scope: '#/properties/notes', options: { multi: true } },
		{ type: 'Control', scope: '#/properties/tags' },
		{
			type: 'Group',
			label: 'Tuning',
			// A rule on a LAYOUT: the whole group comes and goes, which is what an
			// author who writes one means.
			rule: { effect: 'SHOW', condition: { scope: '#/properties/enabled', schema: { const: true } } },
			elements: [
				{
					type: 'HorizontalLayout',
					elements: [
						{ type: 'Control', scope: '#/properties/tuning/properties/depth', options: { slider: true } },
						{ type: 'Control', scope: '#/properties/tuning/properties/temperature' }
					]
				},
				{
					// A rule nested two layouts deep, conditioned on a sibling at the
					// root. "Nested hints are inert" was one of the three live defects.
					type: 'Control',
					scope: '#/properties/tuning/properties/endpoint',
					rule: {
						effect: 'SHOW',
						condition: { scope: '#/properties/engine', schema: { const: 'bedrock' } }
					}
				}
			]
		}
	]
};

const initial = {
	name: 'Console',
	enabled: false,
	engine: 'ollama',
	notes: 'hello',
	tags: ['alpha', 'beta'],
	tuning: { depth: 4, temperature: 0.7, endpoint: 'https://example.invalid' }
};

const mount = (overrides: Record<string, unknown> = {}) =>
	render(Harness, { schema, uischema, initial: { ...initial, ...overrides } });

describe('SchemaForm — widget dispatch on screen', () => {
	it('renders each schema type as its widget', () => {
		mount({ enabled: true });

		expect(screen.getByLabelText(/Display name/)).toHaveValue('Console');
		expect(screen.getByRole('switch', { name: /Enabled/ })).toHaveAttribute(
			'aria-checked',
			'true'
		);
		// bits-ui's Select trigger is a labelled button showing the current option.
		expect(screen.getByLabelText('Engine')).toHaveTextContent('ollama');
		expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
		expect(screen.getByRole('slider', { name: /Depth/ })).toHaveValue('4');
		expect(screen.getByLabelText('Temperature')).toHaveAttribute('type', 'number');
	});

	it('renders an array of strings as removable chips', () => {
		mount({ enabled: true });
		expect(screen.getByText('alpha')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Remove beta' })).toBeInTheDocument();
	});

	it('carries the schema title, description and required marker', () => {
		mount();
		expect(screen.getByText('Shown in the console.')).toBeInTheDocument();
		expect(screen.getByText('(required)')).toBeInTheDocument();
	});

	it('renders nothing flagged when the layout covers the schema with known widgets', () => {
		// The negative control for the loud-unknown rule: a form that is entirely
		// fine must be entirely quiet, or the flag means nothing.
		const { container } = mount({ enabled: true });
		expect(container.querySelectorAll('[data-schema-form-unknown]')).toHaveLength(0);
	});
});

describe('SchemaForm — SHOW/HIDE rules', () => {
	it('hides a Group whose rule does not hold, and the fields inside it', () => {
		mount({ enabled: false });
		expect(screen.queryByText('Tuning')).not.toBeInTheDocument();
		expect(screen.queryByRole('slider', { name: /Depth/ })).not.toBeInTheDocument();
	});

	it('reveals the Group when the value it is conditioned on changes', async () => {
		mount({ enabled: false });
		expect(screen.queryByRole('slider', { name: /Depth/ })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('switch', { name: /Enabled/ }));

		await waitFor(() => {
			expect(screen.getByRole('slider', { name: /Depth/ })).toBeInTheDocument();
		});
	});

	it('evaluates a rule nested two layouts below the value it reads', () => {
		mount({ enabled: true, engine: 'ollama' });
		expect(screen.queryByLabelText('Endpoint')).not.toBeInTheDocument();

		render(Harness, {
			schema,
			uischema,
			initial: { ...initial, enabled: true, engine: 'bedrock' }
		});
		expect(screen.getByLabelText('Endpoint')).toHaveValue('https://example.invalid');
	});

	it('honours a HIDE effect as the inverse of SHOW', () => {
		const hiding = {
			type: 'VerticalLayout',
			elements: [
				{ type: 'Control', scope: '#/properties/enabled' },
				{
					type: 'Control',
					scope: '#/properties/name',
					rule: {
						effect: 'HIDE',
						condition: { scope: '#/properties/enabled', schema: { const: true } }
					}
				}
			]
		};
		render(Harness, { schema, uischema: hiding, initial: { enabled: true, name: 'x' } });
		expect(screen.queryByLabelText(/Display name/)).not.toBeInTheDocument();
	});

	it('disables rather than hides under a DISABLE effect', () => {
		const disabling = {
			type: 'VerticalLayout',
			elements: [
				{
					type: 'Control',
					scope: '#/properties/name',
					rule: {
						effect: 'DISABLE',
						condition: { scope: '#/properties/enabled', schema: { const: true } }
					}
				}
			]
		};
		render(Harness, { schema, uischema: disabling, initial: { enabled: true, name: 'x' } });
		expect(screen.getByLabelText(/Display name/)).toBeDisabled();
	});
});

describe('SchemaForm — emitting changes', () => {
	it('emits the next whole value and the path that changed, without mutating', async () => {
		const onchange = vi.fn();
		render(Harness, { schema, uischema, initial: { ...initial, enabled: true }, onchange });

		await fireEvent.input(screen.getByLabelText(/Display name/), { target: { value: 'Atlas' } });

		expect(onchange).toHaveBeenCalled();
		const [next, change] = onchange.mock.calls.at(-1)!;
		expect(change).toEqual({ path: 'name', value: 'Atlas' });
		expect(next.name).toBe('Atlas');
		// Untouched branches survive intact.
		expect(next.tuning).toEqual(initial.tuning);
		expect(initial.name).toBe('Console');
	});

	it('writes a nested path without flattening its siblings', async () => {
		const onchange = vi.fn();
		render(Harness, { schema, uischema, initial: { ...initial, enabled: true }, onchange });

		await fireEvent.input(screen.getByLabelText('Temperature'), { target: { value: '1.5' } });

		const [next, change] = onchange.mock.calls.at(-1)!;
		expect(change).toEqual({ path: 'tuning.temperature', value: 1.5 });
		expect(next.tuning).toEqual({ ...initial.tuning, temperature: 1.5 });
	});

	it('keeps an array field an array of the item type', async () => {
		const onchange = vi.fn();
		render(Harness, { schema, uischema, initial: { ...initial, enabled: true }, onchange });

		await fireEvent.click(screen.getByRole('button', { name: 'Remove alpha' }));

		const [, change] = onchange.mock.calls.at(-1)!;
		expect(change).toEqual({ path: 'tags', value: ['beta'] });
	});

	it('disables every control when the form is disabled', () => {
		render(Harness, {
			schema,
			uischema,
			initial: { ...initial, enabled: true },
			disabled: true
		});
		expect(screen.getByLabelText(/Display name/)).toBeDisabled();
		expect(screen.getByRole('slider', { name: /Depth/ })).toBeDisabled();
	});
});

describe('SchemaForm — no UI schema', () => {
	it('generates a layout so no field can be missing from one', () => {
		render(Harness, { schema, initial });
		for (const label of ['Display name', 'Engine', 'Notes', 'Tags']) {
			expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
		}
	});
});

describe('SchemaForm — schema validation', () => {
	it('surfaces a violation against the field it belongs to', async () => {
		render(Harness, { schema, uischema, initial: { ...initial, name: undefined } });
		await waitFor(() => {
			expect(screen.getByText('Required')).toBeInTheDocument();
		});
	});
});
