# 0001 — The palette catalogue, and widening the override surface to a tone

Status: accepted, 07/08/2026
Issue: design-system#25

## What landed

The master project's standalone shadcn showcase (`dev/shadcn-showcase/`) is
absorbed into this repo. Its twenty named OKLCH palettes become a catalogue this
package owns and publishes; its gallery becomes `?surface=palette` in the
existing harness; and every palette in it is now gated for contrast in CI, in
both a node test and a real browser.

The showcase predated `@poodle64/design-tokens` by four months and
`@poodle64/ui` entirely, so it vendored its own copy of the shadcn-svelte
primitives and its own palette definitions in the pre-`--ds-*` namespace. It had
not been touched since 2026-03-11. It was a second source of both component
truth and palette truth, and it had been forking quietly for five months.

## The tension this had to resolve

Each of the twenty palettes overrode the **full** semantic set — `background`,
`card`, `popover`, `muted`, `border`, `input`, `ring`, the lot; 27 custom
properties per palette, across 40 blocks.

This package's stated position was narrower. `packages/design-tokens/README.md`
§"Binding constraints" says per-app exceptions are not permitted on named
semantic tokens; the token source's own `$description` says "Binding: no per-app
overrides on named semantics"; and `packages/ui/harness/drive.md` §"Nav ink
against the chrome" describes `--ds-color-primary` as "the one token the package
invites every app to override".

So porting the twenty verbatim would have imported the old model wholesale and
contradicted the current one. But converging them to accent-only looked like it
would destroy several of them: parchment and papyrus-gold are warm-**surface**
palettes, and their identity is the ground, not the accent.

## What the measurement said

The palettes were extracted mechanically rather than read by eye, and compared
against this package's own neutral ladder. Three findings decided it.

**The surface variation is almost entirely hue and chroma, not lightness.**
Seventeen of the twenty light-mode backgrounds sit within ±0.027 of the ladder's
own `0.985`. The three that move meaningfully are zinc and supabase heading for
pure white and near-black — which is a regression against a deliberately
off-white ladder, not a personality. What actually varies is chroma (0.002 to
0.016, against the ladder's 0.003) at hues spanning 32° to 349°.

**A sixth of the catalogue was already accent-only.** `mithril`, `ithildin` and
`silmaril-teal` have byte-identical surfaces in both modes and differ only in
their accent.

**Parchment's identity survives the conversion intact**, because its identity
_is_ a tone: light background `oklch(0.958 0.015 90.2)` against the ladder's
`oklch(0.985 0.003 85)` — near-identical hue, roughly three times the chroma.
Its whole ladder scales the same way (background ×5, muted ×2.7, border ×3.2).

## The decision

A palette is **two knobs, and cannot express a third**:

- **accent** — `--ds-color-primary` per mode, already sanctioned. Its
  `-foreground` pair is _derived_ at build time by `accentForeground()` in
  `sd.config.js` (near-ink or near-white at the accent's own hue, whichever
  measures better against it). The catalogue carries no `foreground` field at
  all, so an illegible pair is unrepresentable rather than merely caught. That
  distinction is load-bearing and was got wrong once: this document originally
  claimed the derivation while the values were in fact hand-authored, which
  adversarial review caught. `test/palettes.test.js` now asserts the emitted
  value is one of the two candidates, so the claim has its own gate.
- **tone** — a hue plus a per-mode chroma **scale**, applied to the neutral
  ladder in `tokens.tokens.json`. Every surface a palette emits is computed from
  that ladder at build time.

There is deliberately **no field for a lightness**. The ladder's L steps are
unreachable from a palette, and they are what every contrast guarantee this
package makes is computed from. There is no field for a status colour either:
the status vocabulary is invariant across palettes, because a warning has to
read as a warning in every app.

Because palettes are _projected through_ the ladder on each build rather than
declared beside it, a palette cannot drift from it. That is the property that
makes this a catalogue rather than a second token source.

## Yes, this widens the sanctioned override surface — here is exactly how much

Stating it plainly, because it is a governance change and it should not pass as
an implementation detail.

**Before:** one knob (`--ds-color-primary` and its foreground pair), constrained
only by a sentence of prose in `DESIGN.md.template`.

**After:** two knobs — accent, and a tone axis that reaches eight neutral
surface tokens (`background`, `foreground`, `surface-1/2/3`, `muted-foreground`,
`border`, `border-strong`).

Three things make this materially narrower than "an app may override a named
semantic token", which remains forbidden:

1. **An app never names a semantic token.** It names a palette, or two numbers.
   The emitted values are the package's, computed from the package's ladder.
2. **The axis that carries legibility is not on the table.** Hue and chroma move
   luminance slightly; lightness moves it decisively, and lightness is
   package-owned by construction, asserted per palette per mode in
   `test/palettes.test.js`.
3. **The widening is gated, where the status quo was not.** The one knob that
   was already sanctioned had no enforcement at all beyond prose. Every knob now
   has some, across twenty palettes and both modes.

The net trade: the override surface widens by one bounded axis, and the
enforcement surface widens from zero palettes to twenty.

## What the gate found, which is the argument for having one

The showcase's README advertised "**WCAG AA compliance indicators**". Nothing
was ever checked. Measured on the way in:

- **Thirteen of the twenty accent pairs were below the 4.5:1 AA floor as a
  fill.** papyrus-gold measured 2.20:1, nile-teal 2.63:1, scribes-amber 2.71:1 —
  each pairing a light accent with a near-white label.
- **zinc's `destructive-foreground` was byte-identical to its `destructive`** —
  a 1:1 label on a destructive button, invisible.
- **supabase declared the same `muted-foreground` in both modes**, so its dark
  mode used a colour picked against a white page.

All three rendered perfectly happily for five months, because rendering was the
only thing anyone did with them.

Deriving the accent foreground fixed all thirteen. Five accents then still sat
mid-lightness (L≈0.55, roughly equidistant from ink and paper) and cleared
neither by enough: teal 4.45, mithril 4.43, silmaril-teal 4.58 light; army 4.28,
ithildin 4.27 dark. Their hue and chroma were held and their lightness walked by
the smallest step that clears 4.6 — at most 0.05, and 0.01 in three of the five.
An accent's identity is its hue; its lightness is what legibility depends on.

## What this costs, stated rather than buried

Parchment's paper gets lighter. Its light background was `L 0.958`; under the
catalogue it is the ladder's `0.985` at parchment's hue and chroma. It is
recognisably the same palette and no longer quite the same paper. That is the
trade the decision makes: a darker ground is buyable only by taking the ladder's
lightness with it, and the ladder's lightness is what `contrast.test.js` and
every figure in `drive.md` rest on. If an app ever genuinely needs a darker
ground, that is a change to the ladder — a package-wide decision with its own
argument — not a per-app override.

`surface-2` in light mode stays pure white under every palette, because the
ladder declares it `neutral.0`, "absolute white", at chroma 0. Left alone
deliberately: it is what gives a warm-surface palette its paper-on-desk read, a
white card on a tinted ground.

## Alternatives rejected

**Port all twenty verbatim.** Imports the model the fold-in exists to end, and
recreates the second source of surface truth in a new location. It also carries
the three defects above forward, because a full override has nowhere for a
derived foreground to live.

**Converge to accent-only.** Cheapest, and the measurement says it is wrong:
parchment and papyrus-gold would become the package's own paper with a warm
accent, which is not what either palette is.

**Make the tone a runtime knob via CSS relative colour syntax.** Tempting —
`oklch(from var(--ds-color-background) l var(--c) var(--h))` — and it fails the
lesson of design-system#8: an alias holding a `var()` reference resolves once, at
`:root`, where a scoped override can never reach it. Build-time projection has
none of that problem, ships inspectable values in `dist`, and lets the gate read
what a browser will actually resolve.

## Where the enforcement lives

| Claim                                                                             | Gate                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A palette keeps the ladder's lightness exactly                                    | `packages/design-tokens/test/palettes.test.js`             |
| The accent's label colour is derived, never authorable                            | same                                                       |
| A palette invents no token, and reaches nothing beyond the sanctioned set         | same                                                       |
| The status vocabulary is invariant                                                | same, and re-asserted from resolved colour in the browser  |
| A palette block outranks `tokens.css` whatever the import order                   | same (specificity is `:root[data-…]`, not source position) |
| Text and accent clear AA, arithmetically                                          | same, all 20 × both modes                                  |
| The same colours clear AA **composited** on the surfaces components paint them on | `packages/ui/harness/drive.mjs`, `?surface=palette`        |

Both gates were driven red before being kept. Restoring papyrus-gold's original
foreground fails the node test at 2.20:1 and the browser gate at 2.19:1 — the
two layers agreeing to 0.01, which is what says they are measuring the same
thing by different routes.
