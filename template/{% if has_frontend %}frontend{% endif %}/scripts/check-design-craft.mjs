#!/usr/bin/env node
/**
 * Fail when the frontend carries a craft defect none of the other gates can see.
 *
 * ESLint, svelte-check, stylelint and the type-checker all pass on UI that is
 * still wrong once a human looks at the rendered page: a card nested inside a
 * card, a side-tab accent border, gradient-text on a heading, decorative
 * grid/glow slop. None of it shows up in a compile, a render, or a passing
 * unit test — it is only visible once someone actually looks. That class is
 * what this gate catches. (Its sibling concern — UI that hand-rolls what
 * @poodle64/ui already ships — is a drift gate's job, not this one's.)
 *
 * It shells out to `impeccable` (github.com/pbakaus/impeccable), an offline
 * anti-pattern detector — no LLM, no API key, no network — built for exactly
 * this: a fixed catalogue of tells mined from what AI-generated UI reliably
 * gets wrong.
 *
 * STATIC MODE ONLY. impeccable also has a `--live` mode that drives the running
 * app in a real browser (contrast, overflow and layout defects that exist only
 * once content is laid out). This gate deliberately does not carry it:
 * `canonical-app-shape.md` makes only the static gate binding, and a browser-
 * driving pre-commit hook buys flakiness for no proven return. If an app wants
 * the live sweep, it adds it as its own app-local tool with its own record.
 *
 * Usage:  node scripts/check-design-craft.mjs [--json] [--baseline]
 * Exit:   0 clean · 1 new hard finding(s) · 2 could not run
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Anchor to the frontend package, not the process cwd. pre-commit runs its
// hooks from the repo root, but `pnpm lint:design` runs from frontend/ — the
// script must resolve the same paths either way. The script lives at
// frontend/scripts/, so the frontend root is its parent's parent.
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPECCABLE = path.join(FRONTEND_ROOT, 'node_modules/.bin/impeccable');
const STATIC_TARGET = path.join(FRONTEND_ROOT, 'src');
const BASELINE = path.join(FRONTEND_ROOT, '.design-craft-baseline.json');

// ---------------------------------------------------------------------------
// Advisory rules: reported below, but never fails the build and never enters
// the baseline. Roughly two thirds of what such a detector reports on a real
// app is noise, so a version without a hard/advisory split gets `--no-verify`'d
// within a week and then catches nothing — the split is the whole reason this
// gate survives contact with a real codebase.
//
// Two sources make a finding advisory:
//
//   1. impeccable's OWN `severity: "advisory"` flag (handled below) — the
//      detector already classes some tells (decorative grid backgrounds,
//      em-dash saturation, off-ramp design-system colours) as opt-in noise
//      rather than failures. We honour that classification directly, so a
//      natively-advisory tell never fails a commit.
//
//   2. This app-local set — a rule impeccable treats as HARD but that this app
//      has argued is a false positive or a taste call it owns. It ships EMPTY
//      on purpose, and that is a decision, not an omission:
//
//        - Cadmus (the reference app this gate was promoted from) carries nine
//          advisory suppressions. Every one of them is either a LIVE-mode
//          finding a static gate never produces (low-contrast,
//          clipped-overflow-container, layout-transition on the shared shell),
//          or a cadmus-specific taste call (its single typeface; the radial
//          "atmosphere" glows in its own app.css). None is both static-reachable
//          AND universal, so a freshly stamped app must not inherit any of them
//          — a fresh app has measured nothing, and suppression is argued, never
//          assumed.
//        - A freshly stamped frontend scans clean here with an empty baseline
//          and an empty set, so there is nothing to pre-suppress.
//
//      When THIS app measures a real false positive, add the rule id below with
//      a dated line stating which it is — a measured false positive or a taste
//      call this app owns — mirroring the discipline the shared rule requires:
//
//        // low-contrast: measured false positive — a 592-element DOM audit
//        //   (2026-08-05) found 134 flags against 9 real failures; the pixel
//        //   sampler reads a decorative ancestor as the background. Real
//        //   contrast lives in the a11y/E2E pass. (LIVE only — kept as an
//        //   example of the required reasoning, not an active entry.)
const ADVISORY_RULES = new Set([]);

if (!existsSync(IMPECCABLE)) {
  console.error(`impeccable not installed at ${path.relative(FRONTEND_ROOT, IMPECCABLE)} — run pnpm install first.`);
  process.exit(2);
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const writeBaseline = args.includes('--baseline');

// ---------------------------------------------------------------------------
// Run impeccable and normalise its result.
//
// impeccable exits non-zero whenever it finds ANYTHING (advisory findings
// included) and 0 only on a clean scan — the opposite of the usual convention,
// and not a signal about whether the RUN succeeded. It also degrades silently:
// hand it an unreachable target and it can print an `Error:` line to stderr and
// still hand back `[]`. So the run's own exit code is not trusted at all;
// success is: the process spawned, stderr is empty, and stdout parses as a JSON
// array. Anything else is "could not run", never silently reported as clean.
// ---------------------------------------------------------------------------

function runImpeccable(cliArgs) {
  const result = spawnSync(IMPECCABLE, cliArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  if (result.error) {
    return { ok: false, message: `could not run impeccable: ${result.error.message}` };
  }
  const stderr = (result.stderr || '').trim();
  if (stderr) {
    return { ok: false, message: stderr };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    return { ok: false, message: `impeccable produced invalid JSON: ${err.message}` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, message: 'impeccable produced an unexpected JSON shape (expected an array)' };
  }
  return { ok: true, findings: parsed };
}

const oneLine = (value, max = 180) => {
  const collapsed = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
};

const res = runImpeccable(['detect', STATIC_TARGET, '--json']);
if (!res.ok) {
  console.error(`Static scan failed: ${res.message}`);
  process.exit(2);
}

const normalised = res.findings.map((f) => ({
  rule: f.antipattern,
  target: path.relative(FRONTEND_ROOT, f.file),
  detail: oneLine(f.snippet ? `${f.name} — ${f.snippet}` : f.name || f.description),
  // A finding is advisory if impeccable itself marks it so, or if this app has
  // argued the rule down (ADVISORY_RULES). Advisory findings are reported,
  // never fail, never baselined.
  advisory: f.severity === 'advisory' || ADVISORY_RULES.has(f.antipattern),
}));

const findings = normalised.filter((f) => !f.advisory);
const advisory = normalised.filter((f) => f.advisory);

// ---------------------------------------------------------------------------
// Baseline: gate on NEW hard findings, not on the backlog. A gate that fails on
// the day it lands gets disabled within a week and then catches nothing; a
// checked-in baseline lets it land on a non-clean app and still fail forward.
//
// The key is `${rule}:${target}` — deliberately NOT line number or selector. A
// line number shifts on every unrelated edit above it and a selector churns on
// a class-name refactor; either would make the gate re-flag a finding that
// never changed, which is how a baseline gate loses trust and gets bypassed.
// Rule + target is stable across exactly the edits that should not re-trip it,
// and unstable across the one that should: fixing or reintroducing the defect.
//
// Known, accepted granularity limit: the key is target-level, so a file already
// on the register for a rule can accumulate more instances of that same rule on
// that same file invisibly. An instance-level key (selector, snippet) would
// churn on every cosmetic edit near a flagged element — the exact noise a
// baseline exists to avoid — and a craft-defect class is rarely fixed one
// instance at a time anyway; it is fixed by revisiting the whole file.
// ---------------------------------------------------------------------------

function key(finding) {
  return `${finding.rule}:${finding.target}`;
}

function readBaselineKeys() {
  if (!existsSync(BASELINE)) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch (err) {
    console.error(`${path.relative(FRONTEND_ROOT, BASELINE)} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(parsed)) {
    console.error(`${path.relative(FRONTEND_ROOT, BASELINE)} does not contain a JSON array.`);
    process.exit(2);
  }
  return new Set(parsed);
}

const known = readBaselineKeys();

if (writeBaseline) {
  const keys = [...new Set(findings.map(key))].sort();
  writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
  console.log(`Baseline written: ${keys.length} known hard finding(s) in ${path.relative(FRONTEND_ROOT, BASELINE)}`);
  process.exit(0);
}

const fresh = findings.filter((f) => !known.has(key(f)));
const fixed = [...known].filter((k) => !findings.some((f) => key(f) === k));

if (asJson) {
  console.log(JSON.stringify({ fresh, grandfathered: findings.length - fresh.length, fixed, advisory }, null, 2));
  process.exit(fresh.length ? 1 : 0);
}

for (const f of fresh) console.error(`${f.target}\n  [${f.rule}] ${f.detail}`);
if (fresh.length) {
  console.error(`\n${fresh.length} NEW design-craft finding(s).`);
  console.error('Fix it, or if it is a false positive for this app, argue the case and add it to ADVISORY_RULES with a dated reason.');
} else {
  console.log(`No new design-craft findings. (${known.size} known, grandfathered.)`);
}
if (fixed.length) {
  console.log(`\n${fixed.length} baseline finding(s) fixed — rerun with --baseline to bank it:`);
  for (const k of fixed) console.log(`  ${k}`);
}
if (advisory.length) {
  console.log(`\nFYI — ${advisory.length} advisory finding(s) (reported, never failing, never baselined):`);
  for (const f of advisory) console.log(`  ${f.target} [${f.rule}] ${f.detail}`);
}

process.exit(fresh.length ? 1 : 0);
