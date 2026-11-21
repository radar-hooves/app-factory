#!/usr/bin/env node
/**
 * Move an app's icons from Lucide to the household set (app-factory#171).
 *
 *   pnpm exec ds-icons-from-lucide [dir ...]          # default: src
 *
 * Rewrites every `@lucide/svelte/icons/<name>` import under the given
 * directories to `@poodle64/ui/icons/<household name>`, keeping the local
 * binding, so the markup that uses it is untouched. `strokeWidth` and
 * `absoluteStrokeWidth` mean nothing on a filled glyph and are removed from
 * that binding's tags; `size`, `color` and `class` carry over as they are.
 * The map is `lucide-to-household.json` beside this file, one entry for every
 * Lucide name the estate imported when it was made. A name it lacks is listed
 * and left alone, so the app's lint names what is still to choose.
 *
 * `--to <prefix>` and `--suffix <ext>` change the target path, for the kit's
 * own source (`--to '#lib/icons/' --suffix .svelte`).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args.splice(i, 2)[1];
};
const to = opt('--to', '@poodle64/ui/icons/');
const suffix = opt('--suffix', '');
const dirs = args.length ? args : ['src'];
const map = JSON.parse(readFileSync(new URL('./lucide-to-household.json', import.meta.url), 'utf8'));

const files = [];
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name.startsWith('.')) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (/\.(svelte|ts|js)$/.test(name)) files.push(path);
	}
};
dirs.forEach(walk);

const IMPORT = /import\s+(\w+)\s+from\s+(['"])@lucide\/svelte\/icons\/([a-z0-9-]+)\2/g;
const unmapped = new Map();
let changed = 0;
for (const file of files) {
	const source = readFileSync(file, 'utf8');
	const bindings = [];
	let out = source.replace(IMPORT, (whole, binding, quote, name) => {
		const target = map[name];
		if (!target) {
			unmapped.set(name, [...(unmapped.get(name) ?? []), file]);
			return whole;
		}
		bindings.push(binding);
		return `import ${binding} from ${quote}${to}${target}${suffix}${quote}`;
	});
	for (const binding of bindings) {
		out = out.replace(new RegExp(`<${binding}\\b[^>]*>`, 'g'), (tag) =>
			tag.replace(/\s+(?:absoluteStrokeWidth|strokeWidth)(?:=(?:\{[^}]*\}|"[^"]*"))?/g, '')
		);
	}
	if (out !== source) {
		writeFileSync(file, out);
		changed++;
	}
}
console.log(`ds-icons-from-lucide: ${changed} file(s) rewritten`);
for (const [name, where] of unmapped) console.log(`  no household name for '${name}': ${where.join(', ')}`);
process.exit(unmapped.size ? 1 : 0);
