import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// 9176, from the Showcase band (9170-9199) in the operator port registry.
// strictPort in package.json, so a clash fails loudly instead of drifting to
// another port and leaving the registry row a lie.
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: { port: 9176, strictPort: true }
});
