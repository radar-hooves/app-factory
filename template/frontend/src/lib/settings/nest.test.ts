import { describe, expect, it } from 'vitest';
import { nestSchema, nestValues } from './nest';

describe('nestValues', () => {
	it('nests dotted keys along their path and leaves an undotted key where it is', () => {
		expect(
			nestValues({
				'intelligence.extraction_model': 'mimir/deep',
				'intelligence.confirm_supported': false,
				'fat_controller.stage_models.triage': 'mimir/fast',
				plain: 3
			})
		).toEqual({
			intelligence: { extraction_model: 'mimir/deep', confirm_supported: false },
			fat_controller: { stage_models: { triage: 'mimir/fast' } },
			plain: 3
		});
	});
});

describe('nestSchema', () => {
	it('turns each path segment into an object group holding the property schema unchanged', () => {
		const toggle = { type: 'boolean', title: 'A toggle' };
		const model = { type: 'string', title: 'A model', enum: ['mimir/deep'] };
		expect(
			nestSchema({
				type: 'object',
				properties: { 'example.toggle': toggle, 'intelligence.extraction_model': model }
			})
		).toEqual({
			type: 'object',
			properties: {
				example: { type: 'object', properties: { toggle } },
				intelligence: { type: 'object', properties: { extraction_model: model } }
			}
		});
	});
});
