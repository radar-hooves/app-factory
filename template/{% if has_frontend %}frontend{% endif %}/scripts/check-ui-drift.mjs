#!/usr/bin/env node
/**
 * Fail when the app hand-rolls something the shared design system already ships.
 *
 * This exists because the failure it catches is invisible to every other gate.
 * A hand-written card compiles, renders, type-checks and passes its tests; it
 * is only wrong when a human opens it on a real display and sees that it does
 * not match the rest of the app. By then the operator is the linter, which is
 * the arrangement this script ends. Its sibling gate (check-design-craft.mjs)
 * catches craft defects — nested cards, accent borders, slop — in what the app
 * DID compose; this one catches the app composing nothing at all where the
 * package ships the answer.
 *
 * `canonical-app-shape.md` makes this gate binding on every full-stack app. The
 * reference implementation it names is `repos/cadmus/scripts/check-ui-drift.mjs`;
 * this is that script, adapted for a freshly-stamped app — anchored to the
 * frontend package rather than a repo root, and shipping only the two checks
 * that are universal (see below).
 *
 * TWO CHECKS, both universal to any app on the shared package:
 *   1. A local component whose name matches one @poodle64/ui ships.
 *   2. A route writing its own <h1> instead of composing the shared PageHeader.
 *
 * Cadmus carries a THIRD check — a route composing a package component its
 * surface brief does not name. It is deliberately NOT carried here: surface
 * briefs were not promoted to the household standard (master-project#249 — four
 * briefs against thirty routes in cadmus's own home app), so a template that
 * demanded them would enforce a contract the estate has decided against. An app
 * that adopts surface briefs can add that check back locally, with its own
 * `docs/product/surfaces/` contract behind it.
 *
 * Usage:  node scripts/check-ui-drift.mjs [--json] [--baseline]
 * Exit:   0 clean · 1 new drift · 2 could not run
 */

import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Anchor to the frontend package, not the process cwd. pre-commit runs its
// hooks from the repo root, but `pnpm lint:drift` runs from frontend/ — the
// script must resolve the same paths either way. The script lives at
// frontend/scripts/, so the frontend root is its parent's parent.
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI_DIST = path.join(FRONTEND_ROOT, 'node_modules/@poodle64/ui/dist/components/ui');
const SRC = path.join(FRONTEND_ROOT, 'src');
const BASELINE = path.join(FRONTEND_ROOT, '.ui-drift-baseline.json');

if (!existsSync(UI_DIST)) {
  console.error(`@poodle64/ui not installed at ${path.relative(FRONTEND_ROOT, UI_DIST)} — run pnpm install first.`);
  process.exit(2);
}

const shipped = new Set(readdirSync(UI_DIST).filter((d) => statSync(path.join(UI_DIST, d)).isDirectory()));

/** kebab-case a PascalCase component name, to compare against a package subpath. */
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(SRC);
const rel = (f) => path.relative(FRONTEND_ROOT, f);
const findings = [];

// ---------------------------------------------------------------------------
// 1. A local component with the same name as one the package ships.
//
// `20-sveltekit-frontend.md` forbids this outright, and the reason is not
// tidiness: a vendored copy cannot receive an upstream fix. It also drifts —
// the copy grows a prop, the shared one grows a different one, and the two
// diverge silently because nothing compares them.
//
// `components/ui/` is excluded: those are this app's own shadcn primitives for
// things the package genuinely does not ship (chart, form, sheet, sidebar).
// ---------------------------------------------------------------------------
for (const f of files.filter((f) => f.endsWith('.svelte'))) {
  if (f.includes(`${path.sep}components${path.sep}ui${path.sep}`)) continue;
  const name = path.basename(f, '.svelte');
  if (shipped.has(kebab(name))) {
    findings.push({
      rule: 'vendored-copy',
      file: rel(f),
      detail: `local ${name} duplicates @poodle64/ui/${kebab(name)}; import the shipped one`,
    });
  }
}

// ---------------------------------------------------------------------------
// 2. A route page that writes its own <h1> instead of composing PageHeader.
//
// This is what produced six different page-title treatments in one app. Each
// one looked perfectly reasonable in its own file; the divergence is only
// visible across files, which is why a human never catches it and a script
// always does.
//
// No route type is exempt here, on purpose. Cadmus exempts its immersive
// `records/` surfaces (which render without the workbench shell and carry
// their own chrome), but that is a cadmus concept a fresh app does not have —
// suppression is argued per app, never inherited (the same discipline the
// craft gate's empty advisory set keeps). A route that legitimately owns its
// own title treatment banks the finding in .ui-drift-baseline.json; a whole
// class of such routes is argued as an app-local exception with a dated reason.
// ---------------------------------------------------------------------------
for (const f of files.filter((f) => path.basename(f) === '+page.svelte')) {
  const src = readFileSync(f, 'utf8');
  // Deliberately NOT "…and does not import PageHeader". That was the first
  // version in cadmus, and a synthetic test caught it passing a page that had
  // swapped its PageHeader back for a raw <h1> while leaving the now-unused
  // import behind — the import alone satisfied the condition. PageHeader emits
  // the page's <h1> itself, so a route writing its own is wrong either way: it
  // has abandoned the shared treatment, or it has shipped two h1s.
  if (/<h1[\s>]/.test(src)) {
    findings.push({
      rule: 'hand-rolled-page-title',
      file: rel(f),
      detail: 'writes its own <h1>; compose PageHeader so every route shares one title treatment',
    });
  }
}

// ---------------------------------------------------------------------------
// Informational: shipped components this app never imports.
//
// NOT a failure. Plenty are legitimately unneeded. It is printed because the
// audit that prompted the reference script started exactly here — reading the
// list and asking, for each one, "do we hand-roll that?" — and the answer was
// yes four times over.
// ---------------------------------------------------------------------------
const allSource = files
  .filter((f) => f.endsWith('.svelte') || f.endsWith('.ts'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const unused = [...shipped].filter((c) => !new RegExp(`@poodle64/ui/${c}\\b`).test(allSource)).sort();

// ---------------------------------------------------------------------------
// Baseline: gate on NEW drift, not on the backlog.
//
// A gate that fails on the day it lands gets disabled within a week, and then
// catches nothing forever. Grandfathering what already exists and failing only
// on what a change ADDS is what makes it survivable. A freshly stamped app
// ships this baseline EMPTY: the scaffold composes what the package ships, so
// there is nothing to grandfather. It is added to copier's `_skip_if_exists`,
// so `copier update` never wipes the debt an app has since banked.
//
// The baseline is a debt register, not an amnesty: `--baseline` rewrites it, so
// shrinking it is a visible diff and growing it needs a deliberate act.
// ---------------------------------------------------------------------------
//
// The key is `${rule}:${file}` — deliberately NOT a line number or a selector,
// either of which churns on unrelated edits and re-flags a finding that never
// changed, which is how a baseline gate loses trust and gets bypassed.
//
// A uniform `${rule}:${file}` key is safe ONLY because both rules here are
// one-finding-per-file by construction: a file either duplicates a shipped name
// or it does not, a page either writes its own <h1> or it does not. Cadmus's
// third rule (surface-brief-divergence, not carried here) is NOT one-per-file —
// one page can compose several undeclared components — and keying it this way
// was a measured fail-open there: banking one divergence silently banked the
// rest, and a fresh divergence on an already-flagged page produced no finding.
// So if a rule that can fire more than once per file is ever added back, its
// key MUST gain a discriminator (the component name); do not "tidy" this back
// to uniform.
const key = (f) => `${f.rule}:${f.file}`;

if (process.argv.includes('--baseline')) {
  writeFileSync(BASELINE, JSON.stringify(findings.map(key).sort(), null, 2) + '\n');
  console.log(`Baseline written: ${findings.length} known finding(s) in ${path.relative(FRONTEND_ROOT, BASELINE)}`);
  process.exit(0);
}

const known = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : []);
const fresh = findings.filter((f) => !known.has(key(f)));
const fixed = [...known].filter((k) => !findings.some((f) => key(f) === k));

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        fresh,
        grandfathered: findings.length - fresh.length,
        fixed,
        unusedShippedComponents: unused,
      },
      null,
      2
    )
  );
  process.exit(fresh.length ? 1 : 0);
}

for (const f of fresh) console.error(`${f.file}\n  [${f.rule}] ${f.detail}`);
if (fresh.length) {
  console.error(`\n${fresh.length} NEW design-system drift finding(s).`);
  console.error('Compose what the package ships; a local copy cannot receive an upstream fix.');
} else {
  console.log(`No new design-system drift. (${known.size} known, grandfathered.)`);
}
if (fixed.length) {
  console.log(`\n${fixed.length} baseline finding(s) fixed — rerun with --baseline to bank it:`);
  for (const k of fixed) console.log(`  ${k}`);
}
if (unused.length) {
  console.log(`\nFYI — ${unused.length} shipped components this app never imports:`);
  console.log(`  ${unused.join(', ')}`);
  console.log('  Worth a glance: is any of them something a page here hand-rolls?');
}

process.exit(fresh.length ? 1 : 0);
