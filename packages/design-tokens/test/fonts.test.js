/**
 * Every `--ds-font-*` name must be one the actual font package registers.
 *
 * radar-hooves/cadmus (29/09/2026): `--ds-font-display` named the bare
 * 'Fraunces', but `@fontsource-variable/fraunces` registers its @font-face
 * as 'Fraunces Variable' — the family this token names never matched the
 * @font-face a consuming app actually loads, so it silently fell through to
 * the generic serif fallback in every stamped app, not just cadmus. A CSS
 * build and a jsdom render both stay green either way; only reading the
 * shipped @fontsource-variable stylesheet and cross-checking the token's own
 * family list against it can catch a rename or a wrong token value here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(repoRoot, 'dist', 'tokens.css'), 'utf8');

/** The declared value of `--ds-font-<name>` in the built stylesheet. */
function fontValue(name) {
	const match = new RegExp(`--ds-font-${name}:\\s*([^;]+);`).exec(css);
	if (!match) throw new Error(`--ds-font-${name} not found in dist/tokens.css`);
	return match[1];
}

/** The family a `@fontsource-variable` package actually declares in its @font-face. */
function shippedFamily(pkg) {
	const pkgJsonPath = require.resolve(`${pkg}/package.json`);
	const entry = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).main;
	const stylesheet = readFileSync(join(pkgJsonPath, '..', entry), 'utf8');
	const match = /font-family:\s*'([^']+)'/.exec(stylesheet);
	if (!match) throw new Error(`${pkg}'s ${entry} declares no @font-face font-family`);
	return match[1];
}

const TOKENS = [
	['display', '@fontsource-variable/fraunces'],
	['body', '@fontsource-variable/hanken-grotesk'],
	['code', '@fontsource-variable/jetbrains-mono']
];

for (const [token, pkg] of TOKENS) {
	test(`--ds-font-${token} names the family ${pkg} actually ships`, () => {
		const family = shippedFamily(pkg);
		assert.match(
			fontValue(token),
			new RegExp(`'${family}'`),
			`--ds-font-${token} does not include '${family}' — the @font-face ${pkg} registers — ` +
				`so a browser loading it falls through to the generic fallback`
		);
	});
}
