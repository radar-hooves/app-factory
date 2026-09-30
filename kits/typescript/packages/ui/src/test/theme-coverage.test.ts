/**
 * Gate: no component may ship a colour utility that compiles to nothing (#3).
 *
 * The defect this exists to make loud: `bg-card` is a perfectly ordinary class
 * name, and if `card` is not registered as a Tailwind theme colour, Tailwind
 * emits NO rule for it. The markup is identical either way, so a type check
 * passes, a lint passes, a render test passes, a screenshot diff passes — and
 * the component ships with no surface colour. ~126 such references survived
 * every gate in this repo and a full app migration before anyone noticed.
 *
 * The check compiles the real built package with the real Tailwind compiler,
 * wired up exactly as a consuming app wires it, and fails naming the missing
 * registration. Adding a component that references a new colour alias without
 * registering it now fails here instead of shipping dead.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
	colourCandidates,
	colourNameOf,
	compile,
	customProperties,
	declaration,
	distDir,
	flatten,
	packageRoot,
	walk
} from './tailwind-probe';

const distFiles = walk(distDir);
const candidates = [...colourCandidates(distFiles)].sort();

/** A colour name Tailwind would never have to resolve — it is built in. */
const BUILT_IN = new Set(['transparent', 'current', 'inherit', 'black', 'white']);

describe('colour utilities referenced by the built package', () => {
	it('finds candidates to check at all (guards the extractor itself)', () => {
		// A silent extractor regression would make every assertion below vacuous.
		expect(candidates.length).toBeGreaterThan(20);
		expect(candidates).toContain('bg-card');
		expect(candidates).toContain('border-input');
	});

	it('every one resolves to a real rule in a consuming app', () => {
		const emitted = compile(candidates);
		const silent = candidates.filter((candidate) => !ruleFor(emitted, candidate));

		// A candidate that emits nothing is either a dead colour utility (the
		// defect) or a string this extractor mistook for a class. Tailwind itself
		// tells the two apart: register the name it would need and recompile. If
		// a rule appears, it WAS a colour utility referencing an unregistered
		// name. If it stays silent, it was never a utility. That keeps this gate
		// free of an allow-list — an allow-list is the thing a future dead
		// utility would get quietly added to.
		const probe = [...new Set(silent.map(colourNameOf))]
			.filter((name) => /^[a-z0-9-]+$/.test(name))
			.map((name) => `\t--color-${name}: #abcdef;`)
			.join('\n');
		const probed = compile(silent, { extraCss: `@theme {\n${probe}\n}` });

		const dead = silent
			.filter((candidate) => ruleFor(probed, candidate))
			.map((candidate) => `${candidate} (needs --color-${colourNameOf(candidate)})`);

		expect(dead, 'colour utilities that generate no CSS in a consuming app').toEqual([]);
	});

	it('every one resolves through to a concrete colour, not a dangling var()', () => {
		// A registration pointing at a variable nothing defines emits a rule and
		// still paints nothing. Flattening the var chain is what separates
		// "Tailwind knew the name" from "the colour actually arrives".
		const emitted = compile(candidates);
		const properties = customProperties(emitted);

		const dangling = candidates
			.filter((candidate) => !BUILT_IN.has(colourNameOf(candidate)))
			.map((candidate) => [candidate, ruleFor(emitted, candidate)] as const)
			.filter(([, value]) => value !== null && flatten(value, properties) === null)
			.map(([candidate, value]) => `${candidate} -> ${value}`);

		expect(dangling, 'colour utilities whose var() chain never reaches a value').toEqual([]);
	});
});

describe('Tailwind theme variables the package reads directly', () => {
	/**
	 * Tailwind v4 tree-shakes theme variables: a `--color-*` / `--radius-*` key
	 * is only emitted when a generated utility uses it. So reading one from an
	 * inline style attribute or a plain CSS rule is a trap — it works right up
	 * until the utility that happened to retain it is removed from an unrelated
	 * component. This is exactly how the Toaster came to be painted with an
	 * undefined `var(--color-popover)`.
	 */
	it('survive into a consuming app rather than being tree-shaken away', () => {
		const referenced = new Set<string>();
		for (const file of [...distFiles, join(packageRoot, 'src', 'lib', 'styles.css')]) {
			const text = readFileSync(file, 'utf8');
			for (const [, name] of text.matchAll(/var\((--(?:color|radius|text|font|spacing)-[a-z0-9-]+)/g)) {
				referenced.add(name);
			}
		}

		// Compile the built package the way a consumer does — Tailwind scans it
		// and decides for itself which theme variables to keep.
		const emitted = compile([], { extraCss: `@source "${distDir}";` });
		const properties = customProperties(emitted);
		const missing = [...referenced].filter((name) => !properties.has(name)).sort();

		expect(missing, 'theme variables read by the package but absent from the output').toEqual([]);
	});
});

describe('custom properties inherited from the React registry', () => {
	it('reads no --radix-* variable, which nothing in a Svelte tree ever sets', () => {
		// shadcn/ui is a Radix wrapper and its class strings carry Radix's own
		// positioning variables. shadcn-svelte is a bits-ui wrapper; bits-ui sets
		// --bits-* and never --radix-*. A --radix-* reference that survives the port
		// is therefore permanently undefined, and an undefined custom property makes
		// the declaration invalid at computed-value time — so the property silently
		// falls back and nothing anywhere reports it. Popover's transform-origin
		// shipped that way, scaling from the box centre instead of from its trigger.
		const offenders = distFiles
			.filter((file) => /--radix-/.test(readFileSync(file, 'utf8')))
			.map((file) => relative(packageRoot, file))
			.sort();

		expect(offenders, 'files referencing a Radix variable bits-ui does not set').toEqual([]);
	});

	it('reads only --bits-* variables the INSTALLED bits-ui actually sets', () => {
		// The `--radix-*` check above catches a variable from the wrong library.
		// This one catches the harder case: a plausible `--bits-*` name from the
		// right library that no version of it ever set, or that a version bump
		// renamed. Both fail identically and silently — an undefined custom
		// property makes the declaration invalid at computed-value time, so the
		// popover's height cap and zoom origin simply do not apply and nothing
		// anywhere reports it.
		//
		// The allow-list is DERIVED from node_modules, never typed here, so it
		// moves with the dependency rather than with someone's memory of it.
		// bits-ui exposes two families: the `--bits-floating-*` set the floating
		// layer writes on its wrapper, and the per-component aliases
		// `getFloatingContentCSSVars(name)` writes on the content inside it. The
		// component NAMES come out of that helper's call sites, so a component
		// this package never mounts cannot lend its name to a variable either.
		const bitsDir = join(packageRoot, 'node_modules', 'bits-ui', 'dist');
		const bitsFiles = walk(bitsDir).filter((f) => /\.(js|svelte)$/.test(f));

		const declared = new Set<string>();
		const floatingNames = new Set<string>();
		for (const file of bitsFiles) {
			const text = readFileSync(file, 'utf8');
			for (const [, name] of text.matchAll(/"(--bits-[a-z0-9-]+)"/g)) declared.add(name);
			// Every string literal inside the call's parentheses, not just a bare
			// argument: Select passes a ternary (`isCombobox ? "combobox" :
			// "select"`), so a pattern expecting one literal silently missed three
			// perfectly valid variables and reported them as fictions.
			for (const [, args] of text.matchAll(/getFloatingContentCSSVars\(([^)]*)\)/g)) {
				for (const [, name] of args.matchAll(/"([a-z][a-z-]*)"/g)) floatingNames.add(name);
			}
		}
		// The five aliases the helper writes for each floating component.
		for (const name of floatingNames) {
			for (const suffix of [
				'content-transform-origin',
				'content-available-width',
				'content-available-height',
				'anchor-width',
				'anchor-height'
			]) {
				declared.add(`--bits-${name}-${suffix}`);
			}
		}

		// Guard the extractor: a regex that stopped matching would make the
		// assertion below vacuously green.
		expect(declared.size).toBeGreaterThan(20);
		expect(declared.has('--bits-floating-available-height')).toBe(true);

		const offenders: string[] = [];
		for (const file of distFiles) {
			for (const [, name] of readFileSync(file, 'utf8').matchAll(/(--bits-[a-z0-9-]+)/g)) {
				if (!declared.has(name)) offenders.push(`${relative(packageRoot, file)}: ${name}`);
			}
		}

		expect(
			[...new Set(offenders)].sort(),
			'--bits-* variables this package reads that the installed bits-ui never sets'
		).toEqual([]);
	});
});

describe('arbitrary values that name a custom property', () => {
	it('uses the parenthesis form, never the square-bracket form', () => {
		// `border-[--border-strong]` is not a syntax error and not a dead class: it
		// compiles, and it compiles to `border-color: --border-strong`, which is
		// not a colour. The declaration is dropped, the border falls back to
		// `currentColor`, and a dropdown menu draws its edge in whatever ink the
		// text happens to be. Tailwind v4's form for "the value is this custom
		// property" is `border-(--border-strong)`; the bracket form means "the
		// value is this literal", and a bare `--x` is not a valid literal for any
		// property that takes a colour or a length.
		//
		// It survives every other gate for the usual reason — the class is in the
		// DOM, a rule exists, and only its VALUE is nonsense. The colour gate above
		// cannot see it either: `colourCandidates` skips anything with a bracket,
		// because an arbitrary value normally carries its own colour.
		//
		// A registered theme name (`border-border-strong`) is better still where
		// one exists, since it goes through @theme and follows a scoped override;
		// this gate only refuses the form that cannot work at all.
		const offenders: string[] = [];
		for (const file of distFiles) {
			for (const [, utility] of readFileSync(file, 'utf8').matchAll(
				/\b([a-z][a-z-]*-\[--[a-zA-Z0-9-]+\])/g
			)) {
				offenders.push(`${relative(packageRoot, file)}: ${utility}`);
			}
		}

		expect(
			[...new Set(offenders)].sort(),
			'arbitrary values naming a custom property with brackets — use the -(--name) form'
		).toEqual([]);
	});
});

describe('the shadcn semantic surface', () => {
	const CASES = [
		['bg-card', 'background-color', '--ds-color-surface-2'],
		['bg-popover', 'background-color', '--ds-color-surface-3'],
		['bg-muted', 'background-color', '--ds-color-surface-1'],
		['bg-secondary', 'background-color', '--ds-color-surface-1'],
		['border-input', 'border-color', '--ds-color-border'],
		['text-card-foreground', 'color', '--ds-color-foreground'],
		['text-accent-foreground', 'color', '--ds-color-foreground'],
		['text-popover-foreground', 'color', '--ds-color-foreground'],
		['text-secondary-foreground', 'color', '--ds-color-foreground'],
		['text-muted-foreground', 'color', '--ds-color-muted-foreground']
	] as const;

	it.each(CASES)('%s resolves to the value of %s', (utility, property, token) => {
		const emitted = compile([utility]);
		const value = declaration(emitted, utility, property);
		expect(value, `${utility} generated no ${property}`).not.toBeNull();

		const properties = customProperties(emitted);
		const expected = flatten(`var(${token})`, properties);
		expect(expected, `${token} is not defined by the token package`).not.toBeNull();
		expect(flatten(value!, properties)).toBe(expected);
	});

	// `bg-accent` is deliberately not in CASES above: since #24 it is not an
	// alias of a surface rung at all. It was `--ds-color-surface-2` — the exact
	// rung `--color-card` resolves to — which made `hover:bg-accent/50` on a card
	// a no-op BY CONSTRUCTION, since mixing a colour at any opacity over a ground
	// identical to it cannot move a pixel. Every structural gate in this file
	// passed while that was true, which is why the two below assert VALUES.
	it('bg-accent is a tint of the accent, not a surface rung', () => {
		const emitted = compile(['bg-accent']);
		const value = declaration(emitted, 'bg-accent', 'background-color');
		expect(value, 'bg-accent generated no background-color').not.toBeNull();
		// Reaching --ds-color-primary is the whole claim, and it holds in both
		// branches Tailwind emits — the color-mix rule and the flat @supports
		// fallback beside it. Asserting on the color-mix alone would pin whichever
		// of the two `declaration` happens to return first.
		expect(value!).toContain('--ds-color-primary');
		expect(value!).not.toContain('--ds-color-surface');
	});

	it('bg-accent does not resolve to bg-card, so a card hover cannot be silent', () => {
		// The #24 regression guard, as a value comparison. A structural check
		// cannot make this claim: both utilities emit a perfectly good rule when
		// they are the same colour.
		const emitted = compile(['bg-accent', 'bg-card']);
		const properties = customProperties(emitted);
		const accent = declaration(emitted, 'bg-accent', 'background-color');
		const card = declaration(emitted, 'bg-card', 'background-color');
		expect(flatten(accent!, properties)).not.toBe(flatten(card!, properties));
	});

	it('a per-app palette override still flows all the way through', () => {
		// The household contract is "override --ds-color-*, everything follows".
		// This asserts the chain is unbroken end to end rather than merely
		// present: change the token, and the utility's resolved colour changes.
		const emitted = compile(['bg-card'], {
			extraCss: ':root { --ds-color-surface-2: rebeccapurple; }'
		});
		const properties = customProperties(emitted);
		const value = declaration(emitted, 'bg-card', 'background-color');
		expect(flatten(value!, properties)).toBe('rebeccapurple');
	});

	it('is mapped by this package, so a consuming app needs no alias layer', () => {
		// The whole point of #3: the contract ships beside the components that
		// depend on it. If this moved back out to per-app CSS, the next app to
		// adopt the package inherits the same broken surface.
		//
		// The mapping is a fallback chain (design-system#8), not a single
		// reference: --color-card: var(--card, var(--ds-color-surface-2)). The
		// bare name (--card) carries no default of its own — see the scoped-
		// override tests below — so this asserts the chain shape rather than a
		// direct --name: var(--ds- pairing.
		//
		// text-muted-foreground is excluded: --ds-color-muted-foreground is a
		// design-tokens-owned key registered by that package's own @theme
		// inline block (asserted in design-tokens' own test suite), never by
		// this one — CASES covers it for the compile-and-resolve test above,
		// not for this package-ownership assertion.
		const stylesheet = readFileSync(join(distDir, 'styles.css'), 'utf8');
		for (const [utility] of CASES) {
			if (utility === 'text-muted-foreground') continue;
			const name = colourNameOf(utility);
			expect(stylesheet, `--${name} is not mapped in the shipped stylesheet`).toMatch(
				new RegExp(`--color-${name}\\s*:\\s*var\\(--${name},\\s*var\\(--ds-`)
			);
		}

		// `accent` holds the same contract with one extra step: the bare name is
		// still the escape hatch and the fallback still lands on a --ds- token,
		// but it arrives through a color-mix because the accent is a tint (#24).
		expect(stylesheet, '--accent is not mapped in the shipped stylesheet').toMatch(
			/--color-accent\s*:\s*var\(--accent,[^;]*var\(--ds-/
		);
	});

	it('has exactly one owner per theme key, across both packages', () => {
		// @theme registration is decided by import order, so a key both packages
		// register resolves differently depending on which stylesheet came last —
		// an app override that works in one app's app.css and silently does
		// nothing in another's. One owner per key is what makes the next test's
		// order-independence possible at all.
		const ours = registeredColourKeys(readFileSync(join(distDir, 'styles.css'), 'utf8'));
		const theirs = registeredColourKeys(
			readFileSync(require.resolve('@poodle64/design-tokens/tokens.tw.css'), 'utf8')
		);
		const contested = [...ours].filter((key) => theirs.has(key)).sort();

		expect(ours.size, 'this package registers no colour keys at all').toBeGreaterThan(0);
		expect(contested, 'colour keys registered by both packages').toEqual([]);
	});

	it('resolves identically whichever order the stylesheets are imported', () => {
		const forward = compile(candidates);
		const reverse = compile(candidates, { reverseChain: true });
		const forwardProperties = customProperties(forward);
		const reverseProperties = customProperties(reverse);

		const divergent = CASES.filter(([utility, property]) => {
			const a = declaration(forward, utility, property);
			const b = declaration(reverse, utility, property);
			return (
				a === null ||
				b === null ||
				flatten(a, forwardProperties) !== flatten(b, reverseProperties)
			);
		}).map(([utility]) => utility);

		expect(divergent, 'utilities whose colour depends on stylesheet import order').toEqual([]);
	});

	it('honours a per-app palette override in either import order', () => {
		for (const reverseChain of [false, true]) {
			const emitted = compile(['bg-card', 'bg-primary'], {
				reverseChain,
				extraCss: ':root { --ds-color-surface-2: rebeccapurple; --ds-color-primary: goldenrod; }'
			});
			const properties = customProperties(emitted);
			const where = reverseChain ? 'reverse order' : 'documented order';
			expect(
				flatten(declaration(emitted, 'bg-card', 'background-color')!, properties),
				`bg-card ignores the token override in ${where}`
			).toBe('rebeccapurple');
			expect(
				flatten(declaration(emitted, 'bg-primary', 'background-color')!, properties),
				`bg-primary ignores the token override in ${where}`
			).toBe('goldenrod');
		}
	});

	it('registers no theme colour that nothing consumes', () => {
		// The mirror image of the dead-utility defect above, and just as silent: a
		// registered key with no reader is an affordance that does nothing. An app
		// pointing --ds-shell-chrome-foreground at a contrasting value got no
		// effect at all, because the shell painted its chrome text off --foreground
		// and --muted-foreground and read the key it advertised nowhere — so the
		// only way to get chrome ink that inverts against the palette was to
		// override a package style, which is the per-app divergence this package
		// exists to end.
		//
		// A key with no consumer is worse than a missing key: a missing one fails
		// loudly at the utility, a dead one looks like a supported option.
		const registered = registeredColourKeys(readFileSync(join(distDir, 'styles.css'), 'utf8'));
		const shipped = distFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

		const unread = [...registered]
			.filter((key) => {
				// Either a colour utility names it, or something reads the theme
				// variable directly. Longest-name-first matching is not needed: the
				// utility carries the full key, so `text-shell-foreground` does not
				// satisfy `--color-shell`.
				const utility = new RegExp(`[\\s"'\`:]((?:bg|text|border|ring|outline|fill|stroke|decoration|caret|accent|divide|placeholder|shadow|from|via|to)-${key})(?![a-z0-9-])`);
				return !utility.test(shipped) && !shipped.includes(`var(--color-${key})`);
			})
			.sort();

		expect(registered.size, 'this package registers no colour keys at all').toBeGreaterThan(0);
		expect(unread, 'theme colours registered by this package that no component reads').toEqual([]);
	});

	it('ships the stylesheet at the documented subpath', () => {
		const exports = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).exports;
		expect(exports['./styles.css']).toBe(
			`./${relative(packageRoot, join(distDir, 'styles.css')).split('\\').join('/')}`
		);
	});
});

/** The `--color-*` keys a stylesheet registers in its own @theme blocks. */
function registeredColourKeys(css: string): Set<string> {
	const keys = new Set<string>();
	for (const [, body] of css.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
		for (const [, key] of body.matchAll(/^\s*--color-([a-z0-9-]+)\s*:/gm)) keys.add(key);
	}
	return keys;
}

/** The declared value of whichever property `candidate`'s rule sets, or null. */
function ruleFor(css: string, candidate: string): string | null {
	for (const property of [
		'background-color',
		'color',
		'border-color',
		'--tw-ring-color',
		'outline-color',
		'fill',
		'stroke',
		'caret-color',
		'accent-color',
		'text-decoration-color',
		'--tw-gradient-from',
		'--tw-gradient-via',
		'--tw-gradient-to',
		'--tw-shadow-color',
		'--tw-inset-shadow-color',
		'--tw-inset-ring-color',
		'border-bottom-width',
		'border-top-width',
		'border-left-width',
		'border-right-width',
		'border-style',
		'border-width',
		'text-align',
		'font-size',
		'box-shadow',
		'background-clip',
		'outline-style',
		'text-wrap',
		'--tw-ring-offset-width',
		'--tw-ring-offset-color'
	]) {
		const value = declaration(css, candidate, property);
		if (value !== null) return value;
	}
	// Fall back to "a rule exists at all", so an unusual utility is never
	// reported dead just because this list does not name its property.
	const escaped = candidate.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
	return new RegExp(`(?:^|\\n)\\s*\\.${escaped}\\s*\\{`).test(css) ? '' : null;
}
