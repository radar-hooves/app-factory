// THE CONTRACT TEST.
//
// The estate's outgoing renderers lost fields in silence — a `widget: "dropdown"`
// hint rendered no input, three config groups missing from a hardcoded order
// rendered nothing, a nested hint was inert — and shipped that way for months
// because a form with a field missing looks exactly like a form. The absence of
// this test is the direct cause of those defects; it is the deliverable, not a
// nicety.
//
// Every assertion here is written so that it FAILS if the fallback were silent:
// each one requires visible, findable evidence in the DOM, and each one also
// asserts the value that would otherwise have been lost is still on screen.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Harness from './schema-form.svelte';
import type { UISchemaElement } from '$lib/components/ui/schema-form';

const flagged = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('[data-schema-form-unknown]'));

const reasons = (container: HTMLElement) =>
	flagged(container).map((node) => node.getAttribute('data-unknown-reason'));

describe('an unrecognised widget hint renders loudly', () => {
	const schema = {
		type: 'object',
		properties: { engine: { type: 'string', title: 'Engine', enum: ['ollama', 'bedrock'] } }
	};
	const uischema = {
		type: 'VerticalLayout',
		elements: [
			// The exact hint that rendered nothing in the renderer being retired.
			{ type: 'Control', scope: '#/properties/engine', options: { widget: 'dropdown' } }
		]
	};

	it('flags the control, names the hint, and still shows the value', () => {
		const { container } = render(Harness, { schema, uischema, initial: { engine: 'bedrock' } });

		// 1. Something is on screen at all. A silent fallback fails here.
		expect(flagged(container)).toHaveLength(1);
		expect(reasons(container)).toEqual(['unknown-widget']);

		// 2. It is legible to a human, not just to a query selector.
		expect(screen.getByText('Unrecognised control')).toBeInTheDocument();
		expect(screen.getByText(/no widget is registered for "dropdown"/)).toBeInTheDocument();

		// 3. The pointer is named, so the fix is a copy-paste.
		expect(screen.getByText('#/properties/engine')).toBeInTheDocument();

		// 4. The value the old renderer dropped on the floor is still here.
		expect(screen.getByLabelText('Raw value')).toHaveValue('bedrock');
	});

	it('does NOT quietly substitute the widget the hint probably meant', () => {
		// `dropdown` almost certainly meant `select`. Guessing would restore the
		// field and hide the fact that the two documents disagree — the same
		// class of defect, one step quieter.
		render(Harness, { schema, uischema, initial: { engine: 'bedrock' } });
		expect(screen.queryByRole('option')).not.toBeInTheDocument();
		expect(screen.getByLabelText('Raw value')).toBeInTheDocument();
	});

	it('keeps the raw value editable, so the form is still usable', async () => {
		const onchange = vi.fn();
		render(Harness, { schema, uischema, initial: { engine: 'bedrock' }, onchange });

		await fireEvent.input(screen.getByLabelText('Raw value'), { target: { value: 'ollama' } });

		expect(onchange.mock.calls.at(-1)?.[1]).toEqual({ path: 'engine', value: 'ollama' });
	});

	it('coerces the raw value back to the type the schema declares', async () => {
		const onchange = vi.fn();
		render(Harness, {
			schema: { type: 'object', properties: { depth: { type: 'integer', title: 'Depth' } } },
			uischema: {
				type: 'VerticalLayout',
				elements: [{ type: 'Control', scope: '#/properties/depth', options: { widget: 'stepper' } }]
			},
			initial: { depth: 3 },
			onchange
		});

		await fireEvent.input(screen.getByLabelText('Raw value'), { target: { value: '7' } });

		expect(onchange.mock.calls.at(-1)?.[1]).toEqual({ path: 'depth', value: 7 });
	});
});

describe('a chooser with nothing to choose from renders loudly', () => {
	it('flags a select whose subschema declares no values, rather than an empty box', () => {
		const { container } = render(Harness, {
			schema: { type: 'object', properties: { region: { type: 'string', title: 'Region' } } },
			uischema: {
				type: 'VerticalLayout',
				elements: [{ type: 'Control', scope: '#/properties/region', options: { format: 'select' } }]
			},
			initial: { region: 'ap-southeast-2' }
		});

		expect(reasons(container)).toEqual(['no-options']);
		expect(screen.getByLabelText('Raw value')).toHaveValue('ap-southeast-2');
	});
});

describe('an unrecognised UI schema element renders loudly', () => {
	it('flags an element type the vocabulary does not contain', () => {
		const { container } = render(Harness, {
			schema: { type: 'object', properties: { name: { type: 'string' } } },
			// Cast because that is the point: `Accordion` is outside the vocabulary,
			// so a server that sends it is exactly what this test is about.
			uischema: {
				type: 'VerticalLayout',
				elements: [
					{ type: 'Control', scope: '#/properties/name' },
					{ type: 'Accordion', label: 'Advanced', elements: [] }
				]
			} as unknown as UISchemaElement,
			initial: { name: 'x' }
		});

		expect(reasons(container)).toContain('unknown-element');
		expect(
			screen.getByText(/"Accordion" is not a UI schema element this renderer knows/)
		).toBeInTheDocument();
	});
});

describe('a field the layout never mentions renders loudly', () => {
	// The live defect this section exists for: three whole top-level config
	// groups never rendered because their names were absent from a hardcoded
	// GROUP_ORDER, and nothing failed, warned, or looked wrong.
	const schema = {
		type: 'object',
		properties: {
			name: { type: 'string', title: 'Name' },
			retention: { type: 'object', title: 'Retention', properties: { days: { type: 'integer' } } },
			alerting: { type: 'object', title: 'Alerting', properties: { email: { type: 'string' } } }
		}
	};
	const uischema = {
		type: 'VerticalLayout',
		elements: [{ type: 'Control', scope: '#/properties/name' }]
	};

	it('flags every unaddressed top-level group and shows its current value', () => {
		const { container } = render(Harness, {
			schema,
			uischema,
			initial: { name: 'x', retention: { days: 30 }, alerting: { email: 'ops@example.invalid' } }
		});

		expect(reasons(container).filter((reason) => reason === 'not-in-layout')).toHaveLength(2);
		expect(screen.getByText('Not in the layout')).toBeInTheDocument();
		// Structured values are shown, not silently dropped — and not edited, since
		// a text box over an object is a data-loss affordance.
		expect(screen.getByText(/"days": 30/)).toBeInTheDocument();
		expect(screen.getByText(/ops@example\.invalid/)).toBeInTheDocument();
	});

	it('reports an unaddressed group ONCE, at the group, not per leaf', () => {
		const { container } = render(Harness, {
			schema: {
				type: 'object',
				properties: {
					wide: {
						type: 'object',
						title: 'Wide',
						properties: {
							a: { type: 'string' },
							b: { type: 'string' },
							c: { type: 'string' }
						}
					}
				}
			},
			uischema: { type: 'VerticalLayout', elements: [] },
			initial: {}
		});
		expect(flagged(container)).toHaveLength(1);
	});

	it('descends into a group the layout only partly addresses', () => {
		const { container } = render(Harness, {
			schema: {
				type: 'object',
				properties: {
					group: {
						type: 'object',
						properties: {
							shown: { type: 'string', title: 'Shown' },
							forgotten: { type: 'string', title: 'Forgotten' }
						}
					}
				}
			},
			uischema: {
				type: 'VerticalLayout',
				elements: [{ type: 'Control', scope: '#/properties/group/properties/shown' }]
			},
			initial: { group: { shown: 'a', forgotten: 'b' } }
		});

		expect(flagged(container)).toHaveLength(1);
		expect(flagged(container)[0].getAttribute('data-path')).toBe('group.forgotten');
		expect(screen.getByLabelText('Raw value')).toHaveValue('b');
	});

	it('says nothing when the layout addresses everything', () => {
		const { container } = render(Harness, {
			schema: { type: 'object', properties: { name: { type: 'string' } } },
			uischema: { type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/name' }] },
			initial: { name: 'x' }
		});
		expect(flagged(container)).toHaveLength(0);
	});
});

describe('a Control that cannot resolve renders loudly', () => {
	it('flags a scope that points at nothing in the schema', () => {
		const { container } = render(Harness, {
			schema: { type: 'object', properties: { name: { type: 'string' } } },
			uischema: {
				type: 'VerticalLayout',
				elements: [
					{ type: 'Control', scope: '#/properties/name' },
					{ type: 'Control', scope: '#/properties/renamedLastRelease' }
				]
			},
			initial: { name: 'x' }
		});
		expect(reasons(container)).toContain('unresolved-scope');
	});

	it('flags a Control with no scope at all', () => {
		const { container } = render(Harness, {
			schema: { type: 'object', properties: { name: { type: 'string' } } },
			uischema: { type: 'VerticalLayout', elements: [{ type: 'Control', label: 'Orphan' }] },
			initial: {}
		});
		expect(reasons(container)).toContain('missing-scope');
	});

	it('flags a Control aimed at an object, and shows the object read-only', () => {
		const { container } = render(Harness, {
			schema: {
				type: 'object',
				properties: { nested: { type: 'object', title: 'Nested', properties: { a: { type: 'string' } } } }
			},
			uischema: {
				type: 'VerticalLayout',
				elements: [{ type: 'Control', scope: '#/properties/nested' }]
			},
			initial: { nested: { a: 'value' } }
		});

		expect(reasons(container)).toEqual(['object-control']);
		expect(container.querySelector('[data-schema-form-unknown-readonly]')).toBeTruthy();
		expect(screen.queryByLabelText('Raw value')).not.toBeInTheDocument();
	});

	it('flags an array of objects, which no widget can carry', () => {
		const { container } = render(Harness, {
			schema: {
				type: 'object',
				properties: {
					rules: { type: 'array', title: 'Rules', items: { type: 'object', properties: {} } }
				}
			},
			uischema: {
				type: 'VerticalLayout',
				elements: [{ type: 'Control', scope: '#/properties/rules' }]
			},
			initial: { rules: [{ id: 1 }] }
		});
		expect(reasons(container)).toEqual(['unsupported-array']);
		expect(screen.getByText(/"id": 1/)).toBeInTheDocument();
	});
});
