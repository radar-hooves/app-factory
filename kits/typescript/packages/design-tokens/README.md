# design-system — `@poodle64/design-tokens`

The household web design-language factory. One DTCG token source, built by Style Dictionary v4, published to public npm, consumed by every SvelteKit app.

## What is here

```text
tokens/
  tokens.tokens.json    DTCG 2025.10 token source — the single source of truth
  palettes.json         Palette catalogue: 20 named personalities (accent + tone)
sd.config.js            Style Dictionary v4 config (css / tw / js platforms)
templates/
  DESIGN.md.template    Per-app North Star template (copy → DESIGN.md, fill in)
test/                   `pnpm test` — compiles real Tailwind against the build
dist/                   Generated — run `pnpm build`; never edit by hand
  tokens.css            :root (light) + .dark custom properties (--ds-*)
  tokens.tw.css         Tailwind v4 @theme block (aliases the --ds-* vars)
  tokens.js             JS constants (DS_*)
  tokens.d.ts           Type declarations for tokens.js
  palettes.css          One :root[data-ds-palette='…'] block per catalogued palette
  palettes.js           The catalogue as data (DS_PALETTES, DS_PALETTE_NAMES)
  palettes.d.ts         Type declarations for palettes.js
```

## Binding constraints

Non-negotiable across every household app. Per-app exceptions are not permitted
on named semantic tokens: an app never invents a value for one. The two things
an app does choose are its accent and a catalogued palette, both below.

| Constraint         | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| Corner radius base | `0.625rem` (`--ds-radius-lg`)                                 |
| Display font       | Fraunces                                                      |
| Body font          | Avenir Next (Apple system font), else Hanken Grotesk Variable |
| Code / data font   | JetBrains Mono                                                |
| Status vocabulary  | `success` / `warning` / `error` / `info` / `neutral`          |
| Eyebrow size       | `text-2xs` (`--ds-text-2xs`) — never `text-[11px]`            |
| Colour space       | OKLCH                                                         |
| CSS namespace      | `--ds-*`                                                      |
| Token format       | W3C DTCG 2025.10                                              |
| Build tool         | Style Dictionary v4                                           |

## Consuming the package

Published to public npm under the `@poodle64` scope. No registry config, no
`.npmrc`, and no auth token needed to install — an app just adds it like any
other npm dependency.

**Install and wire** (Tailwind v4 app):

```bash
pnpm add @poodle64/design-tokens
```

```css
/* app.css — import order matters */
@import 'tailwindcss';
@import '@poodle64/design-tokens/tokens.tw.css'; /* @theme aliases            */
@import '@poodle64/design-tokens/tokens.css'; /* :root + .dark --ds-* vars */
@import '@poodle64/ui/styles.css'; /* shadcn surface + registration */

/* then: the per-app primary override, and nothing else.
   An app does NOT hand-write a shadcn alias layer; @poodle64/ui ships it.
   (full snippet in templates/DESIGN.md.template §8) */
```

TypeScript:

```ts
import { DS_COLOR_STATUS_SUCCESS_LIGHT } from '@poodle64/design-tokens';
```

Fonts are self-hosted per app: add `@fontsource-variable/fraunces`, `@fontsource-variable/hanken-grotesk`, and `@fontsource-variable/jetbrains-mono` and import them in the root layout. The package declares the family stacks; the app supplies the font files. The body face leads with Avenir Next, Apple's own system font; it needs no package (never bundled, not licensable for web embedding) and simply renders on a device that already has it, falling through to the self-hosted Hanken Grotesk Variable everywhere else.

## The gate: `ds-check-arbitrary-values`

The package ships the gate that keeps an app inside the token layer. It is a
binary, so a consumer picks up a fix with the version bump it already takes:

```bash
pnpm exec ds-check-arbitrary-values src     # default root is src
```

It fails on a colour or size literal hand-written into an arbitrary Tailwind
value — `text-[#ff0000]`, `[color:#ff0000]`, `bg-[red]`,
`bg-[color-mix(...)]`, `max-w-[70ch]`, `p-[.5rem]`, and a literal hiding in a
`var()` fallback such as `bg-[var(--brand,#ff0000)]` — across `.svelte`, `.ts`,
`.js`, `.css` and `.html` under the root, and names what to reach for instead. A
value that IS the token layer (`bg-[var(--ds-color-primary)]`) passes, as do
`transparent` and `currentColor`, which name a behaviour rather than pick a
colour.

**What it deliberately does not gate**, because the rule is "you hand-wrote a
value the token layer already supplies" and these have no token to supply them:

- **Viewport, container-query and line-height lengths** — `h-[55vh]`,
  `w-[50cqw]`, `leading-[3lh]`. Worth a token proposal, not a build failure.
- **A length beside a term the scale cannot replace** — a grid track (`fr`,
  `auto`, `min-content`), a percentage, or a viewport unit. So
  `grid-cols-[16rem_1fr]` and `h-[calc(100dvh-19rem)]` pass, while
  `p-[calc(13px)]` does not: the exemption is the unexpressible *term*, never
  the presence of a function, or wrapping a literal in `min()` would be a
  one-character bypass.
- **Variants** — `max-[600px]:hidden` is a media condition, `[&>*]:mt-2` a
  selector.
- **Vendored primitives** under `lib/components/ui/`, matched on the path: they
  are upstream's source, restyled through the token layer rather than authored
  in the app.

A gate that reports a divergence with no legal fix is one an app turns off, so
everything it does flag has somewhere to go.

It also does not see Tailwind's own default palette (`bg-stone-50`,
`text-black`) or an inline `style` attribute — a pass is not a clean bill of
health, and the failure message says so.

It exits non-zero when it cannot run — no such root, nothing scannable — rather
than reporting there was nothing to do, and prints the file count on a pass so
the log shows it could have acted.

`eslint-plugin-tailwindcss` does not cover this: its no-arbitrary-value rule
does not see Svelte class attributes on Tailwind v4, which is why the gate is a
scanner rather than a lint rule. The estate's shared frontend-CI workflow calls
this bin when the installed version carries it, and falls back to a weaker
inline grep when it does not.

## Per-app customisation

An app's personality is exactly two knobs: its **accent**, and optionally a
**palette** from the catalogue below. Every other semantic token is used as-is,
and an app never hand-writes a value for one.

1. Copy `templates/DESIGN.md.template` to the app repo as `DESIGN.md`.
2. Fill in all `REQUIRED` fields (name, description, primary colours).
3. Add the per-app `:root` override from §8 of the template to `app.css`.
4. Delete template comments before committing.

## The palette catalogue

Twenty named personalities, absorbed from the master project's standalone
shadcn showcase (design-system#25). A palette is an **accent** plus a **tone**:
a hue and a per-mode chroma scale, applied to this package's own neutral
ladder. It is projected through that ladder at build time, so a palette cannot
drift from it, and it has no field for a lightness at all. The ladder's
lightness steps stay package-owned because they are what every contrast
guarantee here is computed from. The status vocabulary is invariant across
palettes: a warning has to read as a warning in every app.

Adopt one by importing the stylesheet and naming the palette on the root
element. Nothing else changes, and no component knows it happened.

```css
/* after tokens.css; the blocks are :root-anchored, so order cannot bite */
@import '@poodle64/design-tokens/palettes.css';
```

```html
<html data-ds-palette="parchment"></html>
```

Or copy that palette's block out of `dist/palettes.css` into the app's own
`:root`, if pinning the values matters more than tracking the catalogue.

| Palette          | Strategy                       | Use case                              |
| ---------------- | ------------------------------ | ------------------------------------- |
| `zinc`           | Neutral baseline               | shadcn-svelte default; no personality |
| `slate`          | Cool blue-grey                 | Corporate, conservative               |
| `burnt-sienna`   | Warm earth tones               | Warm, approachable                    |
| `violet`         | Saturated cool purple          | Distinctive, modern                   |
| `eucalyptus`     | Cool green                     | Australian identity                   |
| `teal`           | Cool cyan-green                | Fresh, modern                         |
| `parchment`      | Warm beige (Flexoki-inspired)  | Reading comfort                       |
| `sage`           | Cool muted green               | Softer alternative                    |
| `rosewood`       | Warm muted pink                | Approachable, rare                    |
| `army`           | Warm olive-drab                | Australian Army identity              |
| `airforce`       | Cool RAAF blue                 | Service identity                      |
| `navy`           | Deep navy with gold accent     | RAN identity                          |
| `supabase`       | Jungle green                   | Data platform identity                |
| `scribes-amber`  | Warm amber                     | Thoth identity                        |
| `papyrus-gold`   | Gold leaf on dark papyrus      | Egyptian heritage                     |
| `nile-teal`      | Deep teal                      | Egyptian faience                      |
| `midnight-lapis` | Deep saturated blue            | Lapis lazuli                          |
| `ithildin`       | Cool violet on a silver ground | Moon-letter silver                    |
| `mithril`        | Cool blue-silver               | Restrained, metallic                  |
| `silmaril-teal`  | Bright teal on a silver ground | Luminous, cool                        |

Every palette is gated for contrast in both modes: `test/palettes.test.js`
computes the floors from the built stylesheet, and `packages/ui/harness`
(`?surface=palette`) drives the same colours in a real browser, composited over
the surfaces components actually paint them on. Adding a palette means adding
an entry to `tokens/palettes.json` and passing both.

Why this shape rather than the full semantic override the showcase used, and
what widening the sanctioned surface to a tone does and does not license:
`docs/development/decision-palette-catalogue-and-the-tone-axis.md`.

## Token architecture

```text
tokens.tokens.json
  └─ palette/           Raw OKLCH primitives (not for direct component use)
       neutral/         warm-neutral light + cool-dark scale
       primary/         Slate-blue defaults (override per app)
       status/          Five semantic status hues (light + dark)
  └─ semantic/          What components consume
       radius/          none / sm / md / lg / xl / full
       spacing/         xs / sm / md / lg / xl / 2xl  (CSS vars only — see below)
       text/            2xs (eyebrow / column head)
       font/            display / body / code
       font-size/       base (root html font-size, CSS var only, see below)
       colour/          surface ladder + status + primary + destructive
                        Each colour has .light and .dark sub-values,
                        emitted as :root + .dark blocks
```

### Spacing is CSS variables only

`--ds-spacing-*` ships in `tokens.css` for hand-written CSS, but the named
scale is deliberately **not** registered in the Tailwind `@theme` block.

Tailwind resolves `w-*`, `max-w-*`, `min-w-*`, and `basis-*` against
`--spacing-*` ahead of `--container-*`. A named `--spacing-2xl` therefore
captures `max-w-2xl`, silently dropping it from 42rem to 3rem and collapsing
every shadcn-svelte dialogue, sheet, and tooltip — no build error, no lint hit,
just broken layout. Our named keys are exactly `xs`–`2xl`, so all of them
collide.

In Tailwind markup use the numeric scale, which carries the same values:

| Token              | Value   | Tailwind |
| ------------------ | ------- | -------- |
| `--ds-spacing-xs`  | 0.25rem | `p-1`    |
| `--ds-spacing-sm`  | 0.5rem  | `p-2`    |
| `--ds-spacing-md`  | 1rem    | `p-4`    |
| `--ds-spacing-lg`  | 1.5rem  | `p-6`    |
| `--ds-spacing-xl`  | 2rem    | `p-8`    |
| `--ds-spacing-2xl` | 3rem    | `p-12`   |

`test/tailwind-namespace.test.js` compiles real Tailwind and asserts the sizing
scale means the same with and without this package, so a future token cannot
reintroduce the collision unnoticed.

## Changing tokens

1. Edit `tokens/tokens.tokens.json` only.
2. `pnpm test` (builds, then checks the emitted contract against real Tailwind) and check `dist/`.
3. Bump `version` in `package.json` and `meta.version` in the token file (CalVer), update `CHANGELOG.md`.
4. Commit, tag `design-tokens-v<version>`, push the tag — CI publishes to public npm.
5. Renovate raises the bump PR in each consuming app.

Never edit `dist/` by hand; it is generated and gitignored.
