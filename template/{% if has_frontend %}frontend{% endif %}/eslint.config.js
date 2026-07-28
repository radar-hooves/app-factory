import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

// No eslint-plugin-tailwindcss: its no-arbitrary-value rule is inoperative
// under Tailwind v4 (no tailwind.config.js to introspect), and v4.2.0 of the
// plugin dropped the flat/recommended export this config used to load,
// crashing ESLint outright. The binding raw-value gate is the frontend-ci.yaml
// grep gate (docs/master/templates/golden-patterns/app-shape-and-frontend.md
// §Enforcement), not this plugin.
export default ts.config(
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/'],
	},
);
