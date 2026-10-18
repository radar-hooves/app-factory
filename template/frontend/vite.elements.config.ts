import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { parse } from 'svelte/compiler';
import { build, defineConfig, type Plugin } from 'vite';
import svelteConfig from './svelte.config.js';

// The second half of `pnpm build`: every component in src/elements/ as one
// script, build/elements.js, which a page loads to place them (backend
// elements.py), and build/elements.d.ts, their attributes typed for a placing
// app's `pnpm generate:elements`. Writes nothing for an app with no element.
// Not a library build, so the one file is minified whole.
const root = import.meta.dirname;
const source = join(root, 'src/elements');
const elements = (() => {
	try {
		return readdirSync(source).filter((name) => name.endsWith('.svelte'));
	} catch {
		return [];
	}
})();

// SvelteKit's own aliases, which this build runs without.
const resolve = {
	alias: Object.fromEntries(
		Object.entries({ $lib: 'src/lib', ...svelteConfig.kit.alias }).map(([name, path]) => [
			name,
			join(root, path)
		])
	)
};
const input = 'src/lib/elements/bundle.ts';
const stylesheet = 'src/lib/elements/elements.css';

export default defineConfig({
	plugins: [
		kitSources(),
		tailwindcss(),
		svelte({ compilerOptions: { customElement: true } }),
		declarations()
	],
	resolve,
	build: {
		outDir: 'build',
		emptyOutDir: false,
		write: elements.length > 0,
		rollupOptions: { input, output: { entryFileNames: 'elements.js', inlineDynamicImports: true } }
	}
});

/**
 * Tailwind compiles utilities for the kit components the elements import, not
 * for all of `@poodle64/ui/dist`, which roughly doubled the stylesheet. It
 * cannot read Vite's module graph, so the elements are bundled once without
 * the stylesheet to learn which component directories they reach, and each
 * becomes an `@source` where `elements.css` has its marker.
 */
function kitSources(): Plugin {
	const KIT = /[\\/]@poodle64[\\/]ui[\\/]dist[\\/]/;
	const COMPONENTS = /[\\/]components[\\/]/;
	let reachedSources: Promise<string> | undefined;
	const reached = async () => {
		const sources = new Set<string>();
		await build({
			configFile: false,
			logLevel: 'silent',
			resolve,
			plugins: [
				{
					name: 'no-stylesheet',
					enforce: 'pre',
					// CSS, not JS: Vite 8 minifies a `.css` module as CSS, which a JS body breaks; `?inline` still exports it as a string.
					load: (id) => (id.split('?')[0]?.endsWith(stylesheet) ? '/* none */' : undefined)
				},
				svelte({ compilerOptions: { customElement: true } }),
				{
					name: 'collect',
					buildEnd() {
						for (const id of this.getModuleIds()) {
							const file = id.split('?')[0] ?? id;
							if (KIT.test(file)) {
								// A file beside the components (a shared util) stands alone: its directory is all of dist.
								const directory = dirname(file);
								sources.add(COMPONENTS.test(directory) ? directory : file);
							}
						}
					}
				}
			],
			build: { write: false, rollupOptions: { input, output: { inlineDynamicImports: true } } }
		});
		return [...sources].map((source) => `@source '${source}';`).join('\n');
	};
	return {
		name: 'element-kit-sources',
		enforce: 'pre',
		async transform(code, id) {
			if (!id.split('?')[0]?.endsWith(stylesheet) || elements.length === 0) return;
			reachedSources ??= reached();
			return code.replace('/* @kit-sources */', await reachedSources);
		}
	};
}

// An attribute arrives as a string unless the element declares Svelte's own
// `customElement.props` type for it, so that declaration decides; a written
// TypeScript type is kept only when it is strings alone.
const DECLARED: Record<string, string> = { String: 'string', Number: 'number', Boolean: 'boolean' };
const STRINGS = /^\s*(?:(?:string|'[^']*'|"[^"]*")\s*(?:\||$)\s*)+$/;

interface Span {
	start: number;
	end: number;
}
interface Member {
	key?: { name?: string };
	typeAnnotation?: { typeAnnotation: Span };
}
interface Statement {
	type: string;
	id?: { name?: string };
	declarations?: { init?: { callee?: { name?: string } }; id: Pattern }[];
	body?: { body?: Member[] };
	typeAnnotation?: { members?: Member[] };
}
interface Pattern {
	properties?: { key?: { name?: string } }[];
	typeAnnotation?: { typeAnnotation: { members?: Member[]; typeName?: { name: string } } };
}
interface Options {
	tag?: string;
	props?: Record<string, { type?: string }>;
}

/** build/elements.d.ts: each element's tag and the attributes its `$props()` takes. */
function declarations(): Plugin {
	return {
		name: 'element-declarations',
		generateBundle() {
			const tags = elements.map((name) => {
				const text = readFileSync(join(source, name), 'utf8');
				const ast = parse(text, { modern: true });
				const options = ast.options?.customElement as Options | undefined;
				if (!options?.tag) this.error(`src/elements/${name} names no customElement tag`);
				const body = (ast.instance?.content.body ?? []) as unknown as Statement[];
				const pattern = body
					.flatMap((node) => node.declarations ?? [])
					.find((declaration) => declaration.init?.callee?.name === '$props')?.id;
				const annotation = pattern?.typeAnnotation?.typeAnnotation;
				const local =
					annotation?.typeName && body.find((node) => node.id?.name === annotation.typeName?.name);
				const written = new Map(
					(
						annotation?.members ??
						local?.body?.body ??
						local?.typeAnnotation?.members ??
						[]
					).flatMap((member) =>
						member.key?.name && member.typeAnnotation
							? [[member.key.name, member.typeAnnotation.typeAnnotation] as const]
							: []
					)
				);
				const fields = (pattern?.properties ?? []).flatMap(({ key }) => {
					if (!key?.name) return [];
					const declared = options.props?.[key.name]?.type;
					const span = written.get(key.name);
					const type = span ? text.slice(span.start, span.end) : '';
					const attribute = declared
						? (DECLARED[declared] ?? 'unknown')
						: STRINGS.test(type)
							? type
							: 'string';
					return [`${key.name}?: ${attribute};`];
				});
				return `\t\t'${options.tag}': import('svelte/elements').HTMLAttributes<HTMLElement> & { ${fields.join(' ')} };`;
			});
			this.emitFile({
				type: 'asset',
				fileName: 'elements.d.ts',
				source: [
					"declare module 'svelte/elements' {",
					'\texport interface SvelteHTMLElements {',
					...tags,
					'\t}',
					'}',
					'',
					'export {};',
					''
				].join('\n')
			});
		}
	};
}
