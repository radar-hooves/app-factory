/**
 * The colour-surface gate must actually bind.
 *
 * The gate exists because losing either load-bearing line in a consumer's
 * app.css breaks nothing that any other gate can see. A gate for that failure
 * is worth exactly as much as its ability to go red, so this builds a real
 * consumer — a temp app with this package and Tailwind linked into it — and
 * drives both failure paths rather than asserting the happy one.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '../..');
const bin = join(packageRoot, 'bin', 'check-colour-surface.mjs');
const tailwindRoot = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));

const IMPORT_LINE = "@import '@poodle64/ui/styles.css';";
const SOURCE_LINE = "@source '../node_modules/@poodle64/ui/dist';";

/**
 * A throwaway app that consumes this package the way a real one does: both
 * load-bearing lines present, and both dependencies linked in.
 */
function makeApp(appCss: string) {
	const dir = mkdtempSync(join(tmpdir(), 'ds-colour-'));
	mkdirSync(join(dir, 'src'), { recursive: true });
	mkdirSync(join(dir, 'node_modules', '@poodle64'), { recursive: true });
	symlinkSync(packageRoot, join(dir, 'node_modules', '@poodle64', 'ui'), 'dir');
	symlinkSync(tailwindRoot, join(dir, 'node_modules', 'tailwindcss'), 'dir');
	writeFileSync(join(dir, 'src', 'app.css'), appCss);
	return dir;
}

function run(cwd: string) {
	try {
		return { status: 0, output: execFileSync(process.execPath, [bin], { cwd, encoding: 'utf8' }) };
	} catch (error) {
		const e = error as { status: number; stdout: string; stderr: string };
		return { status: e.status, output: `${e.stdout}${e.stderr}` };
	}
}

const COMPLETE = ["@import 'tailwindcss';", IMPORT_LINE, SOURCE_LINE, ''].join('\n');

describe('the colour-surface gate', () => {
	it('passes an app that keeps both load-bearing lines', () => {
		const dir = makeApp(COMPLETE);
		try {
			const { status, output } = run(dir);
			expect(output).toContain('semantic utilities resolve');
			expect(status).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('goes red when the @import is dropped — the registration is gone', () => {
		const dir = makeApp(COMPLETE.replace(IMPORT_LINE, ''));
		try {
			const { status, output } = run(dir);
			expect(status).toBe(1);
			expect(output).toContain('bg-card');
			expect(output).toContain('not registered');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('goes red when the @source is dropped — registration survives, scanning does not', () => {
		const dir = makeApp(COMPLETE.replace(SOURCE_LINE, ''));
		try {
			const { status, output } = run(dir);
			expect(status).toBe(1);
			expect(output).toContain('no @source covers @poodle64/ui');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('reports that it could not run, rather than passing, with no stylesheet', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ds-colour-bare-'));
		try {
			const { status, output } = run(dir);
			expect(status).toBe(1);
			expect(output).toContain('no stylesheet at');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
