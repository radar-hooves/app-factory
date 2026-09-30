/**
 * Tailwind v4 namespace regression guard.
 *
 * Compiles a real Tailwind v4 project twice — once plain, once importing the
 * built @theme block — and asserts that consuming this package does not change
 * what the standard sizing utilities mean.
 *
 * This runs the real compiler on purpose. The failure it guards is silent: no
 * build error, no lint hit, just collapsed layout in every consuming app, so
 * only actual Tailwind output can prove the contract holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cli = join(repoRoot, 'node_modules', '.bin', 'tailwindcss');
const themeBlock = join(repoRoot, 'dist', 'tokens.tw.css');

/**
 * The utilities Tailwind resolves against BOTH --spacing-* and --container-*.
 * These are the ones a named spacing entry can silently capture, so they are
 * the whole surface this guard has to cover.
 */
const SIZING_UTILITIES = [
	['max-w-xs', 'max-width'],
	['max-w-sm', 'max-width'],
	['max-w-md', 'max-width'],
	['max-w-lg', 'max-width'],
	['max-w-xl', 'max-width'],
	['max-w-2xl', 'max-width'],
	['w-xs', 'width'],
	['w-2xl', 'width'],
	['min-w-xs', 'min-width'],
	['min-w-2xl', 'min-width'],
	['basis-xs', 'flex-basis'],
	['basis-2xl', 'flex-basis']
];

/**
 * Compile `candidates` through Tailwind and return the emitted CSS.
 * The fixture sits under node_modules so `@import "tailwindcss"` resolves
 * against this package's own dependency tree.
 */
const compile = (candidates, { tokens }) => {
	const dir = mkdtempSync(join(repoRoot, 'node_modules', '.tw-probe-'));
	try {
		writeFileSync(join(dir, 'probe.html'), `<div class="${candidates.join(' ')}"></div>\n`);
		cpSync(themeBlock, join(dir, 'tokens.tw.css'));
		writeFileSync(
			join(dir, 'in.css'),
			['@import "tailwindcss";', '@source "./probe.html";', tokens && '@import "./tokens.tw.css";']
				.filter(Boolean)
				.join('\n')
		);
		execFileSync(cli, ['-i', join(dir, 'in.css'), '-o', join(dir, 'out.css')], { stdio: 'pipe' });
		return readFileSync(join(dir, 'out.css'), 'utf8');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

/** The value of `prop` inside rule `.selector`, or null when the rule is absent. */
const declaration = (css, selector, prop) => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const rule = new RegExp(`^\\s*\\.${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
	if (!rule) return null;
	const decl = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`, 'm').exec(rule[1]);
	return decl ? decl[1].trim() : null;
};

test('sizing utilities mean the same with and without this package', () => {
	const candidates = SIZING_UTILITIES.map(([candidate]) => candidate);
	const withTokens = compile(candidates, { tokens: true });
	const plain = compile(candidates, { tokens: false });

	for (const [candidate, prop] of SIZING_UTILITIES) {
		const expected = declaration(plain, candidate, prop);
		assert.ok(expected, `baseline Tailwind emits no ${prop} for .${candidate}`);
		assert.equal(
			declaration(withTokens, candidate, prop),
			expected,
			`.${candidate} changed meaning when tokens.tw.css is imported`
		);
	}
});

test('max-w-2xl resolves to the 42rem container scale, not a spacing value', () => {
	const css = compile(['max-w-2xl'], { tokens: true });
	assert.equal(declaration(css, 'max-w-2xl', 'max-width'), 'var(--container-2xl)');
	assert.match(css, /--container-2xl:\s*42rem;/);
});

test('@theme registers nothing in the spacing namespace', () => {
	assert.doesNotMatch(
		readFileSync(themeBlock, 'utf8'),
		/^\s*--spacing-/m,
		'a --spacing-* entry in @theme shadows the container scale'
	);
});

test('@theme registers nothing under font-size — it is a root override point, never a Tailwind utility', () => {
	// Left unexcluded it would collide for real: Tailwind generates a
	// font-family utility from any --font-<name> theme key, so --font-size-base
	// would register a nonsensical .font-size-base { font-family: … } utility.
	assert.doesNotMatch(
		readFileSync(themeBlock, 'utf8'),
		/^\s*--font-size-/m,
		'a --font-size-* entry in @theme would collide with font-family utility generation'
	);
});

test('--ds-font-size-base ships in tokens.css for an app to set html { font-size: … } against', () => {
	const tokensCss = readFileSync(join(repoRoot, 'dist', 'tokens.css'), 'utf8');
	assert.match(tokensCss, /--ds-font-size-base:\s*100%;/);
});

test('the design-system namespaces still reach their utilities', () => {
	const css = compile(['bg-primary', 'text-2xs', 'rounded-lg', 'font-sans', 'p-4'], {
		tokens: true
	});

	// Colour registers @theme inline (design-system#8): the utility reads the
	// --ds-* token directly, not the --color-* theme alias, so a scoped
	// subtree or a scoped .dark wrapper can re-theme it.
	assert.equal(declaration(css, 'bg-primary', 'background-color'), 'var(--ds-color-primary)');
	assert.equal(declaration(css, 'text-2xs', 'font-size'), 'var(--text-2xs)');
	assert.equal(declaration(css, 'rounded-lg', 'border-radius'), 'var(--radius-lg)');
	assert.equal(declaration(css, 'font-sans', 'font-family'), 'var(--font-sans)');
	assert.match(css, /--color-primary:\s*var\(--ds-color-primary\);/);
	assert.match(css, /--font-sans:\s*var\(--ds-font-body\);/);

	// The numeric scale is what replaces the named spacing utilities: md is p-4.
	assert.equal(declaration(css, 'p-4', 'padding'), 'calc(var(--spacing) * 4)');
});
