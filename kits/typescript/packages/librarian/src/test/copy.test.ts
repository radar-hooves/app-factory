/**
 * A persona's name is an argument, and a slug is not a name.
 */
import { describe, it, expect } from 'vitest';
import { copyFor, DEFAULT_COPY, personaName, resolveCopy } from '$lib/copy';

describe('personaName', () => {
	it('capitalises a route slug', () => {
		expect(personaName('penny')).toBe('Penny');
	});

	it('spaces a multi-word slug', () => {
		expect(personaName('chief-engineer')).toBe('Chief Engineer');
	});

	it('leaves a name the host already wrote properly', () => {
		// Any capital at all means the host wrote it the way it should read.
		expect(personaName('McTavish')).toBe('McTavish');
		expect(personaName('Penny')).toBe('Penny');
	});

	it('falls back to the library persona rather than rendering nothing', () => {
		expect(personaName('   ')).toBe('Milton');
	});
});

describe('copyFor', () => {
	it('names nobody but the persona it was given', () => {
		const words = copyFor('penny');
		const said = JSON.stringify(words);
		expect(said).not.toContain('Milton');
		expect(words.notHeld).toContain('Penny');
		expect(words.answerFailed).toContain('Penny');
		expect(words.unreachable).toContain('Penny');
		expect(words.scope).toContain('Penny');
		expect(words.welcome).toContain('Penny');
		expect(words.askPlaceholder).toContain('Penny');
		expect(words.answeringPlaceholder).toContain('Penny');
		expect(words.conversationLabel).toContain('Penny');
		for (const word of words.working) expect(word).toContain('Penny');
	});

	it('speaks of a persona without guessing its pronouns', () => {
		const said = JSON.stringify(copyFor('penny'));
		expect(said).not.toMatch(/\b(he|him|his|she|her|hers)\b/i);
	});

	it('is the library persona when nobody is named', () => {
		expect(copyFor()).toEqual(DEFAULT_COPY);
		expect(DEFAULT_COPY.unreachable).toBe("Milton can't be reached right now.");
	});
});

describe('resolveCopy', () => {
	it("puts the host's override on top of the persona's own words", () => {
		const words = resolveCopy({ sources: 'What this rests on' }, 'penny');
		expect(words.sources).toBe('What this rests on');
		expect(words.unreachable).toContain('Penny');
	});

	it('drops a key the host passed as undefined rather than rendering nothing', () => {
		expect(resolveCopy({ sources: undefined }, 'penny').sources).toBe('Sources');
	});
});
