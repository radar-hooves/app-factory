import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { parse } from 'svelte/compiler';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
	plugins: [tailwindcss(), svelte({ compilerOptions: { customElement: true } }), declarations()],
	resolve: { alias: { $lib: join(root, 'src/lib') } },
	build: {
		outDir: 'build',
		emptyOutDir: false,
		write: elements.length > 0,
		rollupOptions: {
			input: 'src/lib/elements/bundle.ts',
			output: { entryFileNames: 'elements.js', inlineDynamicImports: true }
		}
	}
});

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
