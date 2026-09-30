// The widget dispatch table, asserted without rendering anything.
//
// It is a separate file from the render tests on purpose: the table is the part
// a future widget is added to, and the invariant that matters is not "the right
// widget is chosen" but "SOMETHING is always chosen, and the something for an
// input nobody registered is `unknown`". A table that can return no answer is
// how a field disappears.
import { describe, it, expect } from 'vitest';
import { pickWidget, WIDGET_KINDS } from '$lib/components/ui/schema-form';

describe('pickWidget — derivation from the schema', () => {
	it.each([
		['string', { type: 'string' }, 'text'],
		['string with a password format', { type: 'string', format: 'password' }, 'password'],
		['string with a date format', { type: 'string', format: 'date' }, 'date'],
		['string with a date-time format', { type: 'string', format: 'date-time' }, 'datetime'],
		['string with a time format', { type: 'string', format: 'time' }, 'time'],
		['integer', { type: 'integer' }, 'number'],
		['number', { type: 'number' }, 'number'],
		['boolean', { type: 'boolean' }, 'switch'],
		['enum', { type: 'string', enum: ['a', 'b'] }, 'select'],
		['labelled oneOf enum', { oneOf: [{ const: 1, title: 'One' }] }, 'select'],
		['array of strings', { type: 'array', items: { type: 'string' } }, 'tags'],
		['array of integers', { type: 'array', items: { type: 'integer' } }, 'tags'],
		['a nullable string', { type: ['string', 'null'] }, 'text']
	])('renders %s as %s', (_name, schema, widget) => {
		expect(pickWidget(schema).widget).toBe(widget);
	});

	it('honours the two boolean options JSON Forms itself defines', () => {
		expect(pickWidget({ type: 'string' }, { multi: true }).widget).toBe('textarea');
		expect(pickWidget({ type: 'integer', minimum: 1, maximum: 9 }, { slider: true }).widget).toBe(
			'slider'
		);
	});

	it('honours an explicit, registered hint under either spelling', () => {
		expect(pickWidget({ type: 'string' }, { format: 'textarea' }).widget).toBe('textarea');
		expect(pickWidget({ type: 'string' }, { widget: 'password' }).widget).toBe('password');
		expect(pickWidget({ type: 'string', enum: ['a'] }, { format: 'radio' }).widget).toBe('radio');
	});
});

describe('pickWidget — every failure is named, none is silent', () => {
	it('flags a hint no widget is registered for, rather than defaulting', () => {
		// The exact live defect: `widget: "dropdown"` rendered no input at all in
		// the renderer this replaces. Note it does NOT fall back to `select`
		// either — a silent guess is the same class of bug one step quieter.
		const choice = pickWidget({ type: 'string', enum: ['a', 'b'] }, { widget: 'dropdown' });
		expect(choice.widget).toBe('unknown');
		expect(choice.reason).toBe('unknown-widget');
		expect(choice.detail).toContain('dropdown');
	});

	it('flags a scope that resolved to nothing, hint or no hint', () => {
		expect(pickWidget(undefined).reason).toBe('unresolved-scope');
		expect(pickWidget(undefined, { format: 'text' }).reason).toBe('unresolved-scope');
	});

	it('flags a Control pointed at an object, which needs a layout', () => {
		expect(pickWidget({ type: 'object', properties: {} }).reason).toBe('object-control');
	});

	it('flags an array whose items no widget can carry', () => {
		expect(pickWidget({ type: 'array', items: { type: 'object' } }).reason).toBe(
			'unsupported-array'
		);
		expect(pickWidget({ type: 'array' }).reason).toBe('unsupported-array');
	});

	it('flags a type no widget covers, and a subschema with no type at all', () => {
		expect(pickWidget({ type: 'null' }).reason).toBe('unsupported-type');
		expect(pickWidget({}).reason).toBe('unsupported-type');
	});

	it('flags a chooser with nothing to choose from', () => {
		// One level below an unrecognised hint: a `select` over a schema that
		// declares no values renders an empty box, which is the same vanishing act.
		expect(pickWidget({ type: 'string' }, { format: 'select' }).reason).toBe('no-options');
		expect(pickWidget({ type: 'string' }, { format: 'radio' }).reason).toBe('no-options');
		expect(pickWidget({ type: 'string', enum: [] }).reason).toBe('no-options');
	});

	it('flags a non-string hint instead of ignoring it', () => {
		expect(pickWidget({ type: 'string' }, { widget: 7 }).reason).toBe('unknown-widget');
	});

	it('always returns a widget — there is no undefined arm', () => {
		const inputs = [
			undefined,
			{},
			{ type: 'string' },
			{ type: 'weird' },
			{ type: 'array' },
			{ type: 'object' }
		];
		for (const schema of inputs) {
			const choice = pickWidget(schema as never);
			expect(WIDGET_KINDS.includes(choice.widget as never) || choice.widget === 'unknown').toBe(
				true
			);
			if (choice.widget === 'unknown') expect(choice.reason).toBeTruthy();
		}
	});
});
