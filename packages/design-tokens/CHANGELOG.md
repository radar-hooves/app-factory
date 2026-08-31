# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is CalVer (`YYYY.M.x`).

## [2026.8.1] - 2026-08-31

### Fixed

- **Surfaces and borders now separate from the page they sit on
  (design-system#17).** Measured across eight routes of a consuming app with
  real content, 119 non-text checks: a card sat at **1.01-1.03:1** against the
  page, card/input/table borders at **1.28-1.75:1**, the header rule at
  1.31:1. Reproduced here directly from the token source, which is where it
  came from: dark `surface-2` was 1.022:1 off the canvas and `border` 1.285:1
  off the card it bounded. Light mode was the same flat ladder (1.04-1.11:1)
  and went unnoticed only because a white card on a near-white page reads as
  "clean" rather than as missing.

  Every text check on those same routes passed — 618 nodes, zero AA failures —
  which is exactly why this survived. The gate only ever looked at ink.

  The neutral ladder's lightness steps moved; nothing was renamed, no token was
  added to the semantic surface, and no palette gained a field. A palette
  projects this ladder, so all twenty inherit the fix without being touched.

  | Token | Light | Dark |
  | --- | --- | --- |
  | `background` | `0.985` → `0.905` | `0.205` (unchanged) |
  | `surface-1` | `0.970` → `0.878` | `0.175` → `0.168` |
  | `surface-2` | `1.000` → `0.990` | `0.215` → `0.278` |
  | `surface-3` | `0.950` → `1.000` | `0.250` → `0.332` |
  | `border` | `0.860` → `0.770` | `0.300` → `0.455` |
  | `border-strong` | `0.780` → `0.588` | `0.380` → `0.605` |
  | `muted-foreground` | `0.520` → `0.475` | `0.680` → `0.712` |

  - **The dark canvas did not move.** `0.205` is a genuinely near-black ground
    and it is the household's look; the issue named lifting the canvas as the
    equally legitimate alternative, and this is the option that keeps the
    character. What was wrong was never the darkness — it was that everything
    meant to sit ON that canvas differed from it by 1.02:1. The surfaces came
    up to meet it instead.
  - **Light mode had nowhere to go, so the canvas came down.** A white card
    cannot separate from a near-white page by getting whiter. The page is now
    a light grey and pure white became the most elevated rung
    (`surface-3`, popover) rather than the card. `surface-2` takes a new
    `neutral.25`. This also fixes a direction error nobody had noticed: the
    shipped light ladder had `surface-3` **darker** than `surface-2`, so the
    most elevated surface read as the most recessed one.
  - **`border` and `border-strong` carry different floors, and that is the
    design decision rather than an inconsistency.** WCAG 1.4.11 sets 3:1 for
    the visual boundary of a user-interface *component*; `border-strong` is
    the token that bounds a control, so it carries that floor. `border` is the
    hairline that separates content — table rules, card edges, dividers — which
    1.4.11 does not reach, and putting a 3:1 hairline under every card is a
    different design language, not this one. It carries 1.5:1: still a real
    floor, because the shipped 1.28:1 was not a line anybody could see.
  - **The surface floor is 1.2:1 and is perceptibility, not conformance.** A
    fill is not a graphical object under 1.4.11. 1.02:1 is not elevation, it is
    the same colour twice. `surface-1` is the recessed rung and keeps a lower
    floor on purpose — a muted fill is meant to be subtle.

### Added

- **`test/non-text-contrast.test.js`**, so the ladder cannot go flat again.
  Eight cases across both modes: surface separation, both border floors against
  every surface each one bounds, and the direction of the climb. Driven red
  before it was kept — restoring the old dark `surface-2` fails the separation
  case, and restoring the old `border-strong` fails the 3:1 case as well.

### Changed

- `sd.config.js`'s `NEUTRAL_SURFACES` map follows the two repointed light
  surfaces. It is asserted against the token source by `palettes.test.js`,
  which is what caught the stale mapping here rather than a reviewer.

## [2026.8.0] - 2026-08-14

### Added

- **The palette catalogue** (design-system#25). Twenty named OKLCH palettes,
  absorbed from the master project's standalone `dev/shadcn-showcase/`, which
  had carried them since 2026-03-11 in the pre-`--ds-*` namespace and predated
  this package by four months. New source `tokens/palettes.json`; new emitted
  artefacts `dist/palettes.css` (one `:root[data-ds-palette='…']` block per
  palette per mode), `dist/palettes.js` and `dist/palettes.d.ts`
  (`DS_PALETTES`, `DS_PALETTE_NAMES`); new exports `./palettes.css`,
  `./palettes.json` and `./palettes`.

  A palette is exactly two knobs and cannot express a third: an **accent**, and
  a **tone** (a hue plus a per-mode chroma scale) projected at build time
  through the neutral ladder in `tokens.tokens.json`. There is no field for a
  lightness, so the ladder's lightness steps stay package-owned and unreachable
  from a palette; they carry every contrast guarantee this package makes. There
  is no field for a status colour either, since a warning has to read as a
  warning in every app. Because palettes are projected through the ladder
  rather than declared beside it, the catalogue cannot drift from it, and it is
  not a second token source.

  This does widen the sanctioned override surface from one knob to two, which
  is a governance change rather than an implementation detail; the argument,
  the measurement behind it, and what it does and does not license are in
  `docs/development/decision-palette-catalogue-and-the-tone-axis.md`.

- **`test/palettes.test.js`** gates the catalogue: every palette keeps the
  ladder's lightness exactly, invents no token name, reaches nothing beyond the
  sanctioned set, leaves the status vocabulary alone, emits `:root`-anchored
  selectors that outrank `tokens.css` whatever order an app imports them in,
  and clears the 4.5:1 AA floor for body text, muted text and the accent as a
  fill, in both modes. The composited half of the same claim is driven in a
  real browser by `packages/ui/harness` (`?surface=palette`).

### Fixed

- **Three defects carried by the showcase's palettes for five months**, none of
  which anything had ever checked, since its README advertised "WCAG AA
  compliance indicators" and gated nothing. Thirteen of the twenty accent pairs
  were below the 4.5:1 AA fill floor (papyrus-gold 2.20:1, nile-teal 2.63:1,
  scribes-amber 2.71:1, each pairing a light accent with a near-white label);
  zinc's `destructive-foreground` was byte-identical to its `destructive`, a
  1:1 label on a button; and supabase declared the same `muted-foreground` in
  both modes, so its dark mode used a colour picked against a white page.

  Fixed structurally rather than by correcting values. The accent's foreground
  is now DERIVED at build time (near-ink or near-white at the accent's own hue,
  whichever measures better), so an illegible pair is unrepresentable; and no
  palette declares a status colour at all, so the `destructive` defect has
  nowhere to live. Five accents then still sat mid-lightness and cleared
  neither candidate by enough (teal 4.45, mithril 4.43, silmaril-teal 4.58
  light; army 4.28, ithildin 4.27 dark); their hue and chroma were held and
  their lightness walked by the smallest step clearing 4.6, at most 0.05.

## [2026.7.5] - 2026-07-31

### Changed

- **`font.body` (`--ds-font-body`) leads with Avenir Next.** Operator ruling, 31/07/2026: the stack is now `'Avenir Next', 'Hanken Grotesk', 'Hanken Grotesk Variable', ui-sans-serif, system-ui, -apple-system, sans-serif`. Avenir Next is Apple's own system face and is not licensable for web embedding, so it is never bundled or vendored by this package; an Apple device already has it installed and renders it locally, with zero build cost. Every non-Apple platform has no local match for that exact name and falls straight through to the self-hosted variable font, exactly as before this change. Confirmed against Fontsource's own install docs that `@fontsource-variable/hanken-grotesk` registers the family as `Hanken Grotesk Variable`, not plain `Hanken Grotesk`; the plain name is kept ahead of it only as a fallback for a machine with the static cut installed as a system font, mirroring this same token file's existing `font.code` (`JetBrains Mono` / `JetBrains Mono Variable`) pattern.

## [2026.7.4] - 2026-07-31

### Added

- **`--ds-font-size-base`** (semantic.font-size.base), ratified 31/07/2026. Value `100%`: equals the browser default (nominally 16px) while still scaling with a reader's own changed browser text-size preference — a fixed px value would silently override that preference instead. An app sets `html { font-size: var(--ds-font-size-base); }`. Ships in `tokens.css` (`:root`, mode-independent) and the JS/TS constants (`DS_FONT_SIZE_BASE`), like every other token; deliberately excluded from the Tailwind `@theme` block (`THEME_EXCLUDED_NAMESPACES`) since it is a root-element override point, never a utility class, and Tailwind generates a font-family utility from any `--font-<name>` theme key — left unexcluded, `--font-size-base` would register a nonsensical `.font-size-base { font-family: … }`. `templates/DESIGN.md.template` §8 adds the `html { font-size: … }` wiring line.

### Fixed

- **`muted-foreground` was below the WCAG AA text floor (4.5:1) against every light surface** (design-system#13). `palette.neutral.500` (`oklch(0.600 0.012 85)`) measured 3.95:1 on `surface-2`, 3.78:1 on `background`, 3.62:1 on `surface-1`, and 3.41:1 on `surface-3` — the darkest and binding constraint. Since `muted-foreground` is the package's secondary-text colour (descriptions, captions, timestamps, helper copy) this was every app's secondary text, in light mode, on the default palette, no override involved. Lowered to `oklch(0.520 0.012 85)` (chroma/hue unchanged): 4.76–5.28:1 across the four light surfaces, a genuine margin above the floor rather than a bare pass, and still a clear step down from `foreground` (`neutral.800`, L 0.240). Dark mode (`neutral.970`) was already clear — 5.56–6.59:1 across the same four surfaces — and is unchanged. Ratios computed from the built tokens (oklch → linear sRGB → WCAG relative luminance) and cross-checked against design-system#13's own Chromium-measured figures before the fix (exact match to 2dp); asserted going forward in `test/contrast.test.js`.

- Scoped theming (design-system#8). Colour tokens now register with Tailwind v4 via `@theme inline` instead of plain `@theme`, so `bg-background`, `text-muted-foreground`, `border-input` and every other shadcn colour utility this package feeds re-resolve against a scoped `--ds-color-*` override or a scoped `.dark` wrapper — not just at the page root. Previously the utility read a `--color-*` theme-name alias declared once at `:root`; that alias froze at its root-level value and never re-evaluated for a subtree override or a scoped `.dark` class below it (root-level `--ds-color-*` overrides and root-level `.dark` toggling were unaffected either way — only a scope smaller than the page was broken). Radius/text/font registration is unchanged (still plain `@theme`); this only touches colour.

### Changed

- **Breaking, undocumented lever:** an app overriding a Tailwind theme name directly (`:root { --color-background: … }`, `--color-primary`, etc.) no longer has any effect — nothing generated by this package reads that name any more. This was never the documented override point (the README's only stated lever is `--ds-color-*`); it happened to work as an accidental side effect of the bug this release fixes, and at least one consuming app used it as a workaround. Migrate to `:root { --ds-color-background: … }` (or whichever `--ds-color-*` key). By-name override of `--color-*`, `--radius-*`, `--text-*` and `--font-*` for the keys this package registers non-inline is unaffected (unchanged, still non-inline).

## [2026.7.3] - 2026-07-29

### Changed

- **`DESIGN.md.template` now states that `--ds-color-primary` is a FILL constraint, and only a fill constraint.** It said the primary "must meet WCAG AA (>=4.5:1) on its surface in both modes", which an app reasonably reads as the fill case: primary as a background under its own `-foreground` pair. `@poodle64/ui`'s `AppShell` was additionally consuming the token as **ink** on its chrome, which is a second and much stricter requirement that this template never stated (design-system#11). Two real app palettes satisfied the documented rule comfortably and were illegible as nav labels anyway, at 1.90:1 and 2.87:1 against a 4.5:1 floor.

  The shell stopped doing that in `@poodle64/ui@2026.7.8`, so no app is asked to repaint its brand. This template now says so at the point an app picks its hue: the constraint is the fill, a light or high-lightness brand hue costs nothing in legibility, and the primary belongs on the active nav row's tint, edge bar and underline rather than on its label. It also documents `--ds-nav-ink-active`, for an app that wants its brand back on the label and will own the contrast, and names the surface to check that against (`--ds-color-surface-1`, the chrome, not `--ds-color-background`).

  No token values change.

### Fixed

- `DESIGN.md.template` §8 and the README wiring snippet no longer tell an app to hand-write a shadcn alias layer. That snippet was the estate-wide origin of design-system#3: declaring `--card` / `--popover` / `--muted` / `--accent` / `--secondary` / `--input` / `--radius` and the `-foreground` pairs as plain custom properties makes each variable exist but never registers them as Tailwind v4 theme colours, so `bg-card`, `bg-muted`, `bg-accent` and `border-input` compiled to no CSS rule at all — no build error, no lint hit, no failing test. Both now import `@poodle64/ui/styles.css` after the token imports, which ships the mapping and its `@theme inline` registration together. Sidebar and chart colours stay per app.

## [2026.7.2] - 2026-07-16

### Fixed

- Named `--spacing-*` entries no longer ship in the Tailwind `@theme` block (#1). Tailwind resolves `w-*`, `max-w-*`, `min-w-*`, and `basis-*` against `--spacing-*` ahead of `--container-*`, so registering the `xs`–`2xl` keys silently captured those utilities: `max-w-2xl` meant 3rem instead of 42rem, collapsing forms and every shadcn-svelte dialogue, sheet, and tooltip. The failure was silent — no build error, no lint hit. Verified against Tailwind 4.3.2; the blast radius was wider than first reported (`w-*`, `min-w-*`, and `basis-*` were hit too, not only `max-w-*`).

### Changed

- `--ds-spacing-*` is now a CSS-variable-only contract, for hand-written CSS. In Tailwind markup use the numeric scale, which carries identical values (`md` = 1rem = `p-4`). No consumer used the named utilities, so nothing is lost; the two apps carrying a local `--spacing-*: initial` unregistration block can drop it.
- `DESIGN.md.template` drops the per-app spacing override block (it could never reach Tailwind) for a notes field.

### Added

- `pnpm test` — a regression guard that compiles a real Tailwind v4 project against the build and asserts the sizing scale means the same with and without this package, so no future token can reintroduce a namespace collision unnoticed. Wired into CI.

## [2026.7.1] - 2026-07-03

### Added

- `--ds-color-destructive-foreground` (near-white text on a solid destructive control, both modes) — review finding: shadcn-svelte destructive variants reference `text-destructive-foreground`, which had no token backing.

### Changed

- Tailwind `@theme` emitter simplified to one alias form for every semantic group (output byte-identical apart from the new token).
- CI contract assertion now also checks `tokens.tw.css` namespaces and that every `@theme` entry aliases a `--ds-*` var.
- README states the exact GitHub Packages auth contract per consumer class; `DESIGN.md.template` gains the `--destructive-foreground` alias line and current version.

## [2026.7.0] - 2026-07-03

### Added

- DTCG 2025.10 token source (`tokens/tokens.tokens.json`): OKLCH palette primitives, surface ladder, five-token status vocabulary (`success`/`warning`/`error`/`info`/`neutral`), primary/ring/destructive, radius scale (base `0.625rem`), named spacing scale (`xs`–`2xl`), `text-2xs` eyebrow size, and the three binding font families (Fraunces / Hanken Grotesk / JetBrains Mono).
- Style Dictionary v4 build emitting `dist/tokens.css` (`--ds-*` custom properties, `:root` + `.dark`), `dist/tokens.tw.css` (Tailwind v4 `@theme` aliases), and `dist/tokens.js` + `dist/tokens.d.ts` (`DS_*` constants).
- Publish workflow: tag `v*` → GitHub Packages (`@poodle64/design-tokens`).
- Per-app `DESIGN.md` North Star template under `templates/`.
