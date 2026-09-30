/**
 * The palette catalogue's contract (design-system#25).
 *
 * The catalogue is 20 named personalities absorbed from the master project's
 * standalone shadcn showcase, which had carried them since 2026-03-11 with
 * every semantic surface declared outright. Here a palette is two knobs —
 * an accent, and a TONE projected through this package's own neutral ladder —
 * and the tests below are what make that a structural guarantee rather than a
 * convention:
 *
 *   - a palette declares no lightness, so every surface it emits keeps the
 *     ladder's own L step exactly, which is what every contrast guarantee in
 *     this package is computed from;
 *   - a palette invents no token name;
 *   - and every catalogued palette clears the AA text floor, in both modes,
 *     which the showcase advertised ("WCAG AA compliance indicators") and never
 *     once checked. Thirteen of its twenty accent pairs were below the floor as
 *     a fill when they were lifted, three of them under 2.8:1.
 *
 * This is the arithmetic half, computed from the built stylesheet the same way
 * `contrast.test.js` does it. The resolved half — the same colours composited
 * over the real ancestor stack, including the shell chrome's own tints — is
 * driven in a browser by `packages/ui/harness/drive.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '../lib/contrast-math.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const paletteCss = readFileSync(join(repoRoot, 'dist', 'palettes.css'), 'utf8');
const tokenCss = readFileSync(join(repoRoot, 'dist', 'tokens.css'), 'utf8');
const source = JSON.parse(readFileSync(join(repoRoot, 'tokens', 'palettes.json'), 'utf8'));
const tokens = JSON.parse(readFileSync(join(repoRoot, 'tokens', 'tokens.tokens.json'), 'utf8'));

const AA_NORMAL_TEXT = 4.5;
const SURFACES = ['background', 'surface-1', 'surface-2', 'surface-3'];
const NAMES = Object.keys(source.palettes);

/** Every `--ds-color-*` declaration inside one emitted palette block. */
function block(name, mode) {
	const selector =
		mode === 'dark'
			? `:root[data-ds-palette='${name}'].dark {`
			: `:root[data-ds-palette='${name}'] {`;
	const start = paletteCss.indexOf(selector);
	assert.notEqual(start, -1, `no ${mode} block emitted for '${name}'`);
	const body = paletteCss.slice(start + selector.length, paletteCss.indexOf('}', start));
	return Object.fromEntries(
		[...body.matchAll(/--ds-color-([a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])
	);
}

/** The base `--ds-color-*` set from tokens.css, per mode. */
function baseBlock(mode) {
	const darkStart = tokenCss.indexOf('.dark {');
	const body = mode === 'dark' ? tokenCss.slice(darkStart) : tokenCss.slice(0, darkStart);
	return Object.fromEntries(
		[...body.matchAll(/--ds-color-([a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])
	);
}

const lightnessOf = (value) => {
	const parsed = /oklch\(\s*([\d.]+)/.exec(value);
	assert.ok(parsed, `not a plain oklch() value: ${value}`);
	return Number(parsed[1]);
};

test('every catalogued palette emits a block in both modes', () => {
	assert.equal(NAMES.length, 20);
	for (const name of NAMES) for (const mode of ['light', 'dark']) assert.ok(block(name, mode));
});

test('a palette block outranks tokens.css whatever order an app imports them in', () => {
	// `:root[data-ds-palette=…]` is (0,2,0) against tokens.css's `:root` (0,1,0),
	// so specificity decides it and source order cannot. A bare attribute
	// selector would tie at (0,1,0) and be settled by order alone — and would
	// then fail ONLY in light mode, since the dark block carries an extra
	// `.dark` class and outranks `.dark` either way. A palette that applies in
	// one mode and silently not the other is the exact shape of dead affordance
	// `theme-coverage.test.ts` calls worse than a missing key.
	const selectors = [...paletteCss.matchAll(/^(\S*\[data-ds-palette[^{]*)\{/gm)].map((m) =>
		m[1].trim()
	);
	assert.equal(selectors.length, NAMES.length * 2);
	const bare = selectors.filter((s) => !s.startsWith(':root['));
	assert.deepEqual(bare, [], `palette selectors not anchored at :root: ${bare.join(', ')}`);
});

test('a palette invents no token name', () => {
	for (const mode of ['light', 'dark']) {
		const base = new Set(Object.keys(baseBlock(mode)));
		for (const name of NAMES) {
			const unknown = Object.keys(block(name, mode)).filter((k) => !base.has(k));
			assert.deepEqual(unknown, [], `'${name}' (${mode}) declares unknown token(s): ${unknown}`);
		}
	}
});

test('a palette touches the surface ladder and the accent, and nothing else', () => {
	// Named explicitly rather than derived, so widening the sanctioned override
	// surface takes an edit HERE — a visible, reviewable act — instead of
	// happening as a side effect of a change to the emitter.
	const SANCTIONED = new Set([
		'background',
		'foreground',
		'surface-1',
		'surface-2',
		'surface-3',
		'muted-foreground',
		'border',
		'border-strong',
		'primary',
		'primary-foreground',
		'ring'
	]);
	for (const name of NAMES) {
		for (const mode of ['light', 'dark']) {
			const keys = Object.keys(block(name, mode));
			const beyond = keys.filter((k) => !SANCTIONED.has(k));
			assert.deepEqual(
				beyond,
				[],
				`'${name}' (${mode}) reaches beyond the sanctioned set: ${beyond}`
			);
		}
	}
});

test('the status vocabulary is invariant across every palette', () => {
	// A warning has to read as a warning in every app, so no palette may move
	// one — nor `destructive`, which aliases status-error.
	const STATUS = [
		'status-success',
		'status-warning',
		'status-error',
		'status-info',
		'status-neutral',
		'destructive',
		'destructive-foreground'
	];
	for (const name of NAMES) {
		for (const mode of ['light', 'dark']) {
			const declared = Object.keys(block(name, mode)).filter((k) => STATUS.includes(k));
			assert.deepEqual(
				declared,
				[],
				`'${name}' (${mode}) moves the status vocabulary: ${declared}`
			);
		}
	}
});

test("every palette surface keeps the ladder's own lightness, exactly", () => {
	// The load-bearing structural claim. A palette has no field for a lightness,
	// so this can only break if the emitter starts deriving one — and if it ever
	// does, every contrast figure below stops following from the ladder and has
	// to be re-argued per palette instead of once.
	for (const mode of ['light', 'dark']) {
		const base = baseBlock(mode);
		for (const name of NAMES) {
			const emitted = block(name, mode);
			for (const key of Object.keys(emitted)) {
				if (key.startsWith('primary') || key === 'ring') continue; // accent, not ladder
				assert.equal(
					lightnessOf(emitted[key]),
					lightnessOf(base[key]),
					`'${name}' (${mode}) moved --ds-color-${key}'s lightness off the ladder`
				);
			}
		}
	}
});

test('the surface map in sd.config.js still matches the token source', () => {
	// The emitter names each ladder step it re-tones. If a token is renamed or a
	// surface is added to `semantic.colour` and the emitter is not updated, the
	// new surface would keep the package's own hue under every palette — a
	// half-toned page nothing else would notice.
	const laddered = Object.entries(tokens.semantic.colour)
		.filter(([, node]) => String(node.light?.$value ?? '').startsWith('{palette.neutral.'))
		.map(([name]) => name)
		.sort();
	const emitted = Object.keys(block(NAMES[0], 'light'))
		.filter((k) => !k.startsWith('primary') && k !== 'ring')
		.sort();
	assert.deepEqual(emitted, laddered);
});

for (const mode of ['light', 'dark']) {
	test(`every palette's body text clears AA (${AA_NORMAL_TEXT}:1) on every surface — ${mode}`, () => {
		const failing = [];
		for (const name of NAMES) {
			const c = block(name, mode);
			for (const ink of ['foreground', 'muted-foreground']) {
				for (const surface of SURFACES) {
					const ratio = contrastRatio(c[ink], c[surface]);
					if (ratio < AA_NORMAL_TEXT) {
						failing.push(`${name}: ${ink} on ${surface} ${ratio.toFixed(2)}:1`);
					}
				}
			}
		}
		assert.deepEqual(failing, [], `below the AA text floor:\n  ${failing.join('\n  ')}`);
	});

	test(`the accent's label colour is derived, not authorable — ${mode}`, () => {
		// The catalogue has no `foreground` field: `sd.config.js`'s
		// `accentForeground` computes it from the accent's own hue. This is what
		// makes "an illegible pair is unrepresentable" a checked claim rather
		// than a comment — if someone reintroduces an authored foreground, the
		// emitted value stops being one of the two candidates and this fails.
		for (const name of NAMES) {
			const c = block(name, mode);
			const [, , hue] = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(c.primary).slice(1);
			const h = Number(hue).toFixed(1);
			assert.ok(
				[`oklch(0.200 0.030 ${h})`, `oklch(0.990 0.005 ${h})`].includes(c['primary-foreground']),
				`'${name}' (${mode}) has a primary-foreground that is not one of the two derived candidates at hue ${h}: ${c['primary-foreground']}`
			);
		}
		const authored = JSON.stringify(source.palettes).includes('"foreground"');
		assert.equal(authored, false, 'a palette declares a foreground; it must be derived instead');
	});

	test(`every palette's accent clears AA (${AA_NORMAL_TEXT}:1) as a fill — ${mode}`, () => {
		// The constraint the DESIGN.md template already states for a hand-picked
		// primary, now actually enforced for every catalogued one. Thirteen of the
		// twenty failed it as lifted from the showcase; papyrus-gold measured
		// 2.20:1, nile-teal 2.63:1 and scribes-amber 2.71:1, each pairing a light
		// accent with a near-white foreground.
		const failing = [];
		for (const name of NAMES) {
			const c = block(name, mode);
			const ratio = contrastRatio(c['primary-foreground'], c.primary);
			if (ratio < AA_NORMAL_TEXT) failing.push(`${name}: ${ratio.toFixed(2)}:1`);
		}
		assert.deepEqual(failing, [], `accent below the AA fill floor:\n  ${failing.join('\n  ')}`);
	});

	test(`no palette degrades a text pair below the package default — ${mode}`, () => {
		// The tone axis moves hue and chroma and never lightness, so it should be
		// very close to contrast-neutral by construction. This is what proves that
		// claim empirically instead of trusting the arithmetic: a future palette
		// with an extreme chroma scale would show up here as a real regression
		// long before it reached the absolute floor above.
		const base = baseBlock(mode);
		const drifted = [];
		for (const name of NAMES) {
			const c = block(name, mode);
			for (const ink of ['foreground', 'muted-foreground']) {
				for (const surface of SURFACES) {
					const delta = contrastRatio(c[ink], c[surface]) - contrastRatio(base[ink], base[surface]);
					if (delta < -0.75) {
						drifted.push(`${name}: ${ink} on ${surface} ${delta.toFixed(2)}`);
					}
				}
			}
		}
		assert.deepEqual(
			drifted,
			[],
			`tone cost more than 0.75 of contrast:\n  ${drifted.join('\n  ')}`
		);
	});
}
