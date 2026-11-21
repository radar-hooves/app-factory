#!/usr/bin/env node
/**
 * The household icon set: every Phosphor glyph (MIT, phosphoricons.com) in its
 * duotone weight, one Svelte component per glyph at `@poodle64/ui/icons/<name>`.
 *
 * Generated, never edited: `build` and `check` run this, and src/lib/icons/ is
 * gitignored like dist/. One weight only, so a glyph costs two paths rather than
 * the six weights a multi-weight component carries. The duotone layer is
 * `.ds-icon-tone`, which styles.css colours, so a surface can tint it with the
 * app's accent without the glyph knowing.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const assets = dirname(require.resolve('@phosphor-icons/core/assets/duotone/house-duotone.svg'));
const out = new URL('../src/lib/icons/', import.meta.url).pathname;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let count = 0;
for (const file of readdirSync(assets)) {
	const name = file.replace(/-duotone\.svg$/, '');
	const body = readFileSync(join(assets, file), 'utf8')
		.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')
		.replaceAll('opacity="0.2"', 'class="ds-icon-tone"');
	writeFileSync(
		join(out, `${name}.svelte`),
		`<script lang="ts">
	import type { IconProps } from '../icon-props.js';
	let { size = '1em', class: className, ...rest }: IconProps = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={size} height={size} fill="currentColor" aria-hidden="true" class={['ds-icon ds-icon-${name}', className]} {...rest}>${body}</svg>
`
	);
	count++;
}
console.log(`generate-icons: ${count} glyphs → src/lib/icons/`);
