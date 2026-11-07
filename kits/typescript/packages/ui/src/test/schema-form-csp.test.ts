// <SchemaForm> under a CSP that refuses eval (`script-src 'self'`, no
// `unsafe-eval`). Ajv compiles schemas through `new Function`, which such a
// policy throws on, so the form's rules and validation must not reach it.
// jsdom enforces no CSP, so the refusal is reproduced where the browser
// raises it: every `Function` constructor call throws an EvalError.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Harness from './schema-form.svelte';

const RealFunction = globalThis.Function;

beforeEach(() => {
	const refuse = new Proxy(RealFunction, {
		construct() {
			throw new EvalError("Refused to evaluate a string as JavaScript: 'unsafe-eval' is not allowed");
		},
		apply() {
			throw new EvalError("Refused to evaluate a string as JavaScript: 'unsafe-eval' is not allowed");
		}
	});
	vi.stubGlobal('Function', refuse);
});

afterEach(() => vi.unstubAllGlobals());

const schema = {
	type: 'object',
	required: ['name'],
	properties: {
		name: { type: 'string', title: 'Display name' },
		enabled: { type: 'boolean', title: 'Enabled' },
		endpoint: { type: 'string', title: 'Endpoint' }
	}
};

const uischema = {
	type: 'VerticalLayout',
	elements: [
		{ type: 'Control', scope: '#/properties/name' },
		{ type: 'Control', scope: '#/properties/enabled' },
		{
			type: 'Control',
			scope: '#/properties/endpoint',
			rule: { effect: 'SHOW', condition: { scope: '#/properties/enabled', schema: { const: true } } }
		}
	]
};

describe('SchemaForm — CSP without unsafe-eval', () => {
	it('is refused the way the browser refuses it', () => {
		expect(() => new Function('return 1')).toThrow(EvalError);
	});

	it('evaluates a SHOW rule', () => {
		render(Harness, { schema, uischema, initial: { name: 'a', enabled: true } });
		expect(screen.getByText('Endpoint')).toBeInTheDocument();
	});

	it('hides what a rule hides', () => {
		render(Harness, { schema, uischema, initial: { name: 'a', enabled: false } });
		expect(screen.queryByText('Endpoint')).toBeNull();
	});

	it('validates, naming the field', async () => {
		render(Harness, { schema, uischema, initial: { enabled: false }, validate: true });
		await waitFor(() => expect(screen.getByText('Required')).toBeInTheDocument());
	});
});
