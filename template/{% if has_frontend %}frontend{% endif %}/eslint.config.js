import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import tailwind from 'eslint-plugin-tailwindcss';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	...ts.configs.recommended,
	...svelte.configs.recommended,
	...tailwind.configs['flat/recommended'],
	prettier,
	...svelte.configs.prettier,
	{
		settings: {
			tailwindcss: {
				cssConfigPath: './src/app.css',
			},
		},
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
			'tailwindcss/no-arbitrary-value': 'error',
		},
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'src/lib/components/ui/**'],
	},
);
