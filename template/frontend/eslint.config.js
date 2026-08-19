import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import tailwind from 'eslint-plugin-tailwindcss';
import globals from 'globals';
import ts from 'typescript-eslint';
import debt from './eslint.debt.js';

// A template governs the STARTING state and can say nothing about what is
// authored afterwards. A rule governs authoring, but only when a model chooses
// to read and follow it. A lint rule governs authoring deterministically, at
// author time and in CI, whether or not anything was read — and the template is
// how that lint rule reaches every app.
//
// So the restricted globals/imports/syntax below are not style preferences.
// Each one is the literal-code-shape half of an invariant already written in
// rules-library/stacks/sveltekit-{ui-patterns,frontend,quality}.md, moved to the
// mechanism that actually enforces it (core/rules-approach.md §Mechanical
// Enforcement). Anything left in those rules is genuine judgement — is this
// table "simple" or "complex", which columns to hide responsively — which no
// linter can decide.
//
// eslint-plugin-tailwindcss's flat/recommended export crashes under Tailwind
// v4 (no tailwind.config.js to introspect) — never import it; the
// no-arbitrary-value rule below is wired directly instead.
export default ts.config(
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		// Household invariants, enforced rather than recited. Each `message`
		// names the replacement, because a lint error that only says "no" gets
		// suppressed; one that says what to use instead gets followed.
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],

			'no-restricted-globals': [
				'error',
				{
					name: 'confirm',
					message:
						'Use AlertDialog from @poodle64/ui with buttonVariants({ variant: "destructive" }) — a native confirm cannot be styled, tested or made accessible.'
				},
				{
					name: 'alert',
					message: 'Use toast.error()/toast.info() from svelte-sonner.'
				},
				{
					name: '__dirname',
					message: 'Use import.meta.dirname — this project is ESM.'
				}
			],

			// Deliberately NOT here: a blanket ban on `window.location`. Measured
			// against a real app, 9 of 11 hits were legitimate reads (`hostname`,
			// `hash`, `search`, `protocol`) and the other two were the Authentik
			// proxy redirect that proxy-delegated-auth.md REQUIRES. "Do not read
			// navigation state from window.location when `page` has it" is a
			// judgement, so it stays rule prose; a lint rule that is wrong most of
			// the time gets switched off within a week and takes the correct rules
			// with it.
			'no-restricted-properties': [
				'error',
				{
					object: 'window',
					property: 'confirm',
					message: 'Use AlertDialog from @poodle64/ui for destructive-action confirmation.'
				},
				{
					object: 'window',
					property: 'alert',
					message: 'Use toast.error()/toast.info() from svelte-sonner.'
				}
			],

			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '$app/stores',
							message: 'Deprecated. Use `page` from $app/state.'
						},
						{
							name: 'lucide-svelte',
							message: 'Use @lucide/svelte with deep imports: @lucide/svelte/icons/<icon-name>.'
						},
						{
							name: '@lucide/svelte',
							message:
								'Barrel import pulls the whole icon set. Deep-import instead: @lucide/svelte/icons/<icon-name>.'
						},
						{
							name: 'svelte-sonner',
							importNames: ['Toaster'],
							message:
								'Mount <Sonner /> from the local components/ui/sonner wrapper, which carries the mode-watcher theme binding. `toast` itself is imported from here as normal.'
						},
						{
							name: '@tanstack/react-table',
							message: 'React-era adapter. Use @tanstack/svelte-table v9+ (runes-native).'
						},
						{
							name: '@tanstack/svelte-query',
							message:
								'Client-side query caching is not the household pattern — load in onMount() with $state flags (sveltekit-quality.md §Data Fetching).'
						},
						{
							name: 'swr',
							message:
								'Client-side query caching is not the household pattern — load in onMount() with $state flags.'
						},
						{
							name: 'tailwindcss-animate',
							message:
								'Animations arrive through @poodle64/ui/styles.css, which imports tw-animate-css. An app carries neither dependency.'
						},
						{
							name: 'tw-animate-css',
							message:
								'Imported by @poodle64/ui/styles.css already. A second import is a silent fork.'
						}
					],
					patterns: [
						{
							group: ['$lib/components/*', '$lib/stores/*', '$lib/api/*'],
							message: 'Use the $components / $stores / $api aliases declared in svelte.config.js.'
						}
					]
				}
			],

			'no-restricted-syntax': [
				'error',
				{
					// Both receivers: the replacement targets <svelte:document>, so
					// `document.addEventListener` is the MORE idiomatic spelling of the
					// mistake and must not sail through while `window.` is caught.
					selector:
						"CallExpression[callee.object.name=/^(window|document)$/][callee.property.name='addEventListener'][arguments.0.value='keydown']",
					message:
						'Bind keyboard shortcuts with <svelte:document onkeydown={...}> so the listener is torn down with the component.'
				},
				{
					selector: "CallExpression[callee.name='useReactTable']",
					message:
						'React-era API. Use createTable() from @tanstack/svelte-table with getter-based $state bridging.'
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off',

			// svelte/no-at-html-tags (on via svelte.configs.recommended) stays ON.
			// The one sanctioned `{@html}` is DOMPurify-sanitised markdown; suppress
			// it INLINE at each use site, never with a file- or config-level
			// exemption that also blesses the next unsanitised `{@html}` added there:
			//   <!-- eslint-disable-next-line svelte/no-at-html-tags -- html is DOMPurify.sanitize() output -->
			//   {@html html}
			// The reason clause is required — a bare disable is indistinguishable
			// from forgetting to sanitise.

			// The package ships Table/TableHeader/TableBody/TableRow/TableHead/
			// TableCell. A hand-written <table> is the drift that compiles,
			// renders and type-checks, and is only wrong when a human opens it
			// beside a table built the other way.
			'svelte/no-restricted-html-elements': [
				'error',
				{
					elements: ['table', 'thead', 'tbody', 'tr', 'th', 'td'],
					message:
						'Use the shadcn table primitives from @poodle64/ui/table rather than raw table markup.'
				}
			]
		}
	},
	{
		// Wired directly rather than through the plugin's recommended export —
		// see the top-of-file note. The frontend-ci.yaml grep gate
		// (docs/master/templates/golden-patterns/app-shape-and-frontend.md
		// §Enforcement) is the binding check for Svelte `class=` strings, which
		// this rule cannot see; it catches TS/JS-authored class values instead.
		plugins: { tailwindcss: tailwind },
		settings: {
			tailwindcss: {
				cssConfigPath: './src/app.css'
			}
		},
		rules: {
			'tailwindcss/no-arbitrary-value': 'error'
		}
	},
	{
		// Vendored shadcn-svelte primitives — arbitrary values are upstream-managed.
		ignores: ['src/lib/components/ui/**']
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/']
	},

	// App-owned lint debt, banked in eslint.debt.js and spread LAST so each block
	// there overrides a rule above it for its named pre-existing files. Ships
	// empty (a no-op); see that file for the grammar and the no-growth discipline.
	...debt
);
