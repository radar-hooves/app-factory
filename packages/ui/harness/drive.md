# Real-browser verification

Twelve surfaces, selected by `?surface=`: the default `shell` (AppShell,
below), plus `states` (the async-outcome surfaces), `card` (CardTitle's
heading mode), `overlays`, `overflow`, `avatar`, `palette` (the palette
catalogue), `theming`, `detail-panel`, `nested` (nested navigation),
`console` (the console-dashboard primitives) and `mobile-audit` (a realistic
composed page, driven by eye at phone/tablet/desktop) — each in its own
section at the end.

## Two ways to drive it

`harness/drive.mjs` is the **scripted** subset, and it is the one CI runs:

```sh
pnpm run test:browser        # harness:build + drive.mjs, exits non-zero on failure
```

It covers the claims a machine can make unattended — the overlay animations, the
shell's content-region measurements at two phone widths, the nav's contrast
against its chrome across three palettes and both themes, and the avatar's real
load-state swap — and prints every observed value beside its verdict, passing or
failing. Everything else in this file is driven by hand (the household's
`browser-driver` MCP was used), because the claim needs a judgement a script
cannot make.

The split is deliberate (`rules-library/core/73-verification.md` §"Scripts Drive,
Models Judge"): pre-known choreography belongs in a script, and the model's time
belongs on the judgement.

## AppShell (`?surface=shell`, the default)

The interaction logic is proved in `src/test/app-shell.test.ts` under jsdom.
Everything on this page is proved in a real engine instead, because jsdom
**cannot** make any of these claims: it applies no stylesheet and returns the
unresolved `var(--…)` literal from `getComputedStyle`, so an assertion there
passes just as happily on a colour nothing defines. That blind spot has hidden
five separate defects in this programme, and it hid a sixth during this change —
see "What this caught" below.

## Running it

```sh
pnpm run harness:build          # vite build + real Tailwind over dist/
pnpm run harness:serve          # http://127.0.0.1:4180
```

The page reads `?collapsible=1` from the query, so a driver sets configuration
by navigation rather than by synthesising clicks. The THEME is not a query
parameter: it follows the OS preference, so a driver picks
it with `browser.newContext({ colorScheme })`. The harness previously passed
`defaultMode="dark"` to `ModeWatcher`, which was measurably not doing what it
said — mode-watcher tracks the system preference and Chromium's default is
light, so every surface here had in fact been rendering LIGHT since the day it
was written. The contrast section below has to know which theme it is looking
at, so the lever is now the one that actually moves. It
imports from `../dist`, not `../src`: the claim under test is about the artefact
a consuming app installs, and `svelte-package` rewrites import specifiers on the
way out, so the source is not the same input. Its stylesheet is the documented
consumer import chain, verbatim.

## What is asserted, and why it needs an engine

Drive with any browser automation that can evaluate JS in the page (the
household's `browser-driver` MCP was used); read the outcome from the DOM, never
from a screenshot. Two viewports: **1440×900** (desktop) and **390×844** (phone).

| Claim                                                 | Why jsdom cannot make it                                   | Observed                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The chrome surface resolves to a real colour          | jsdom returns `var(--ds-shell-chrome)` and calls it a pass | `oklch(0.97 0.005 85)` light / `oklch(0.175 0.018 260)` dark                                                   |
| The rail is exactly its declared width                | no layout engine                                           | 248px = 15.5rem                                                                                                |
| Active nav differs visibly from inactive              | no cascade                                                 | active `oklch(0.5 0.155 250 / 0.12)` vs inactive transparent                                                   |
| The active marker is not colour alone (WCAG 1.4.1)    | pseudo-elements are not computed                           | rail: 2×24px bar                                                                                               |
| The theme toggle **actually flips**                   | no media/class-driven cascade                              | shell bg `oklch(0.985 0.003 85)` → `oklch(0.205 0.015 260)`, rail follows, restores on second press            |
| Exactly one theme icon shows per mode                 | `dark:` variants never resolve                             | `[block, none]` → `[none, block]`                                                                              |
| The rail collapses and re-expands                     | no transitions, no layout                                  | 248 → 56 → 248px; labels drop to a 1×1 `sr-only` box; links centre                                             |
| The rail is hidden on a phone                         | no media queries                                           | `display: none` at 390px; brand moves into the bar                                                             |
| The drawer opens flush and full-height                | no layout                                                  | `display:none` → `flex`, `position: fixed`, 248px at `left: 0`, scrim covers the viewport, 4 items, active lit |
| The rail and drawer are one element, never two        | no cascade, no layout                                      | exactly one `identity`, one collapse control and one `Primary` landmark in both states                         |
| A drawer opened on a phone is inert once widened      | no media queries                                           | forcing `data-drawer` at 1440px leaves `position: sticky`, 248px                                               |
| Focus enters the overlay and returns on close         | `:focus` and layout are not computed                       | opens onto "Close menu"; Escape returns focus to the trigger                                                   |
| Tab wraps inside the overlay                          | needs a real layout to know what is visible                | 7 of 8 candidates in the cycle; the display:none collapse control excluded; last → first                       |
| The drawer is a dialogue only while it is one         | —                                                          | `role="dialog" aria-modal="true"` on open, both gone on close                                                  |
| No two dismiss controls share a name                  | —                                                          | scrim "Dismiss menu", close "Close menu", trigger "Menu" + `aria-expanded`                                     |
| A tap-through does not leave the drawer over the page | needs real navigation                                      | drawer gone, hash advanced                                                                                     |
| Nothing overflows horizontally on a phone             | no layout                                                  | `scrollWidth <= innerWidth`                                                                                    |
| The palette opens on ⌘K and navigates                 | — (also covered in jsdom)                                  | 4 items listed, hash advanced to the selected item, palette closed                                             |
| The bypass link hides at rest and reveals on focus    | `:focus` styling is not computed                           | `top: -48px` → `8px`, 3px outline, focus lands on `#ds-main`                                                   |

Three measurement traps worth inheriting. Each produced a false failure here,
and the third looked exactly like a total regression:

- **Read a rect after the transition, not with it.** `.ds-skip-link` animates
  `top` over 150ms; reading `getBoundingClientRect()` in the same frame as
  `.focus()` returns the resting value and reads as "the control does nothing".
- **Blur before measuring a resting state.** `evaluate` calls share one page, so
  an element focused by the previous call is still focused in the next.
- **A rebuilt stylesheet is not a reloaded stylesheet.** The page's `<link>` is
  cached across navigations within a session, so re-navigating after
  `harness:build` re-runs the new JS against the OLD css. That reads as "the
  rules do not apply at all" — here it briefly looked like a restructured rail
  had lost every rule. Recreate the session (a fresh context has no cache)
  rather than trusting a query-string bust on the HTML, which does not bust the
  stylesheet.

## What this caught

The theme toggle's sun/moon icons did not swap, in either mode, while the
palette flipped correctly around them. Every existing gate was green: the icons
were in the DOM, the classes were right, the type check passed, and jsdom had
nothing to say about it.

The cause was one layer above this component. Tailwind v4 resolves a bare
`dark:` against `prefers-color-scheme`; the estate uses the class strategy, and
`@custom-variant dark` was **unowned** — all four adopting apps had
independently typed the identical declaration into their own `app.css`, so the
~50 `dark:` utilities this package ships worked only by the grace of every
consumer remembering. The fifth app to adopt would have got a silently
half-dark component set with no error anywhere.

The declaration now ships in `@poodle64/ui/styles.css` beside the utilities that
depend on it, and `src/test/dark-variant.test.ts` compiles the built package
_without_ an app's own declaration and fails if any shipped `dark:` utility
lands somewhere a class-based theme switch cannot reach.

## The async-outcome surfaces (`?surface=states`)

`LoadingState`, `ErrorState` and `EmptyState` from `../dist`, reached by driving
a load (idle → loading → failed | empty) rather than by mounting the finished
markup. What arrives after the page has settled is the whole claim: a live
region only announces if it is there at the instant the outcome lands.

jsdom can see the attribute but not the semantics. `getByRole` there is
testing-library resolving a static element→role table, so it proves the string
`role="alert"` is present and nothing about what a browser hands the platform.
The engine builds the tree itself, which is why the same claim is made twice.

| Claim                                               | Observed (1440×900)                                |
| --------------------------------------------------- | -------------------------------------------------- |
| Nothing announces before a load is under way        | tree carries the three drivers and no live region  |
| An in-flight load is a polite status                | `status "Fetching records…"`                       |
| A failure that arrives later is exposed as an alert | `alert:` → `paragraph: Could not load the estate.` |
| The glyph is not announced beside the message       | no `img`/graphic node inside the alert             |
| An empty result never interrupts                    | `heading "No records"`, no live region             |

**The pre-change build was driven in the same engine**, and the failure surfaced
as a bare `paragraph: Could not load the estate.` — no live region, nothing for
a screen reader to announce, on a surface that only ever appears because the
user's task has broken.

Zero visual difference was measured, not assumed, against that same baseline
build: identical class list, bounding box (1376×166 at 32,72), background
`oklch(1 0 0)`, border `oklab(0.53 0.178201 0.0907981 / 0.4)` at 1px, radius
10px, padding 32px, message colour/size/`max-width` and icon box. The only
difference in the whole read was `role`/`aria-live` going from `null/null` to
`alert/assertive`. Nothing in the package's CSS selects on either attribute
(the only `[role=…]` rules are the table's `[&:has([role=checkbox])]`).

One thing the baseline settled that the source did not: the icon carried
`aria-hidden="true"` **before** the change too. `@lucide/svelte` v1 adds it to
any icon given no `aria-*`/`role`/`title` and no children, so the glyph was
never being announced. The explicit attribute here is a pin against that
default moving, and matches how `LoadingState` already writes it — not a fix
for a live defect.

### The limit of what was verified

The engine proves the alert node is built and carries the message. It does not
prove what a screen reader then _says_, and one nuance is worth writing down
because it is the obvious thing to get wrong later.

`ErrorState` mounts already carrying its message. MDN counsels the opposite —
prime an empty `role="alert"` in the markup first, then inject the text, since
a live region announces on _content change_ and an element that arrives fully
populated is not a change. The Accessibility Developer Guide's matrix tests
exactly the populated-on-insert form and records a pass on NVDA and JAWS across
Firefox, Chrome and Edge, which is the mainstream set and the form every
component library in this class ships. Priming instead would buy the stricter
reading at the cost of a frame of empty box, and of a non-obvious mechanism the
next maintainer would strip.

Two things remain genuinely unverified: **VoiceOver/Safari**, absent from that
matrix, and any real AT at all — no screen reader was run here. If a report ever
arrives that a failure is not announced on a particular pairing, prime the
region rather than re-deriving this from scratch.

The same source notes an alert must be **visible** to be recognised, which this
one is; a caller hiding it with `hidden` or `display:none` would silence it.

## CardTitle's heading mode (`?surface=card`)

Seven cards built from the identical markup, differing in one prop: one plain
`<CardTitle>` and one per `level={1…6}`. Same container width, same siblings,
same body, so any measured difference in the title can only have come from the
tag name.

The claim is that `level` moves the document outline and nothing else, and it
needs an engine on both halves. jsdom cannot support the visual half at all: a
`<div>` and an `<h3>` differ only in what the UA stylesheet adds, and jsdom
applies no stylesheet, so the two are trivially identical there whether or not
anything neutralises the UA metrics. It cannot support the semantic half either
— `getByRole` is testing-library resolving a static element→role table, so it
proves the tag name and nothing about the tree a browser builds.

| Claim                                              | Observed (1440×900)                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The title is a real heading at the level asked for | `H1`…`H6`; tree carries `heading "Estate summary" [level=1…6]`                                                                     |
| The default contributes no heading at all          | tree carries `text: Estate summary`; `document.querySelectorAll('h1,…,h6').length === 0`                                           |
| The class list is identical across all seven       | `text-base leading-snug font-medium group-data-[size=sm]/card:text-sm`, byte-for-byte                                              |
| A heading is laid out identically to the div       | title box 352×22 and card box 384×114 on all seven                                                                                 |
| The UA heading metrics are neutralised             | 18 computed properties identical on all seven — `font-size: 16px`, `font-weight: 500`, `line-height: 22px`, all four margins `0px` |

The margin row is the one that could have gone the other way. `text-base` and
`font-medium` override the UA size and weight from the class list itself, but
**nothing in this package touches a heading's UA margin** — `<h3>` carries
`margin-block: 1em` and a `<div>` carries none, which would have pushed the card
header apart. Tailwind's preflight is what levels it, and this package does not
own preflight, so an app that dropped it would get a layout shift out of a prop
that promises none. `src/test/card-title.test.ts` pins that dependency against
the compiled consumer chain so it is visible rather than assumed.

### The default, measured against the pre-change build

Not merely asserted unchanged. The previous `card-title.svelte` was restored,
`dist` and the harness rebuilt, and the div-mode card measured in the same
engine: identical class list, identical attribute set (`class,data-slot`),
identical 352×22 box inside an identical 384×114 card, and the same 18 computed
properties.

One difference exists and it is worth writing down rather than discovering
later. `<svelte:element>` places its child anchor comment _before_ the content
where a static `<div>` places it after, so the div-mode inner HTML went from
`Estate summary<!---->` to `<!---->Estate summary`. It is an empty comment node:
invisible to layout, to the cascade (comments are not elements, so `:first-child`
is unaffected) and to the accessibility tree, all three measured above. Only an
`innerHTML` string comparison could see it.

The two-branch `{#if level}` alternative was built and measured too, rather than
reasoned about, and it is worse on exactly the criterion this change is held to.
It keeps the div's comment where it was, but adds a block anchor _outside_ the
element (`<!----><!---->` before, `<!---->` after in the parent), and it still
emits `<!---->Estate summary` in the heading branch — so heading and div are NOT
inner-markup identical under it, which is the parity the prop exists to promise.
The single `<svelte:element>` gives that parity, adds nothing to the parent, and
leaves the class list and rest props with only one place to be written.

## The overlay transitions (`?surface=overlays`)

Four bits-ui overlay families — dialogue, dropdown menu, popover, select —
opened for real, with the **resolved** `animation-name` read off the content
element. Scripted in `drive.mjs`.

This is the end of a chain nothing else in the repo can follow. The compiled-CSS
gate proves a rule exists and what selector it carries; only an engine proves the
rule reaches an element that has actually opened, and jsdom resolves no
animation at all.

| Claim                                         | Observed                                           |
| --------------------------------------------- | -------------------------------------------------- |
| Each overlay opens at all                     | dialogue, menu, popover, select: content visible   |
| bits-ui marks the content `data-state="open"` | `open` on all four                                 |
| The enter animation resolves, not `none`      | `animation-name: enter` on all four                |
| It has a real duration                        | `0.1s` (dialogue, menu, select), `0.15s` (popover) |
| Nothing throws                                | no page errors                                     |

### What this caught

Two dead layers, one under the other, and fixing the first alone would have
changed nothing visible.

1. **The variant.** Tailwind compiles a bare `data-open:` to `&[data-open]`;
   bits-ui emits `data-state="open"`. ~47 utilities matched nothing.
2. **The utility.** `animate-in`, `fade-in-0`, `zoom-in-95` and
   `slide-in-from-*` are not Tailwind utilities — they come from
   `tw-animate-css`, which this package did not import. With the variants fixed
   and nothing else, `animation-name` still read `none`: a completely separate
   cause with exactly the same silence.

Also caught here: popover's content carried the React registry's
`transform-origin` variable, inherited verbatim in the port, which nothing in a
Svelte tree sets — so the zoom scaled from the box centre rather than from the
trigger.

## The shell's content region (`?surface=overflow`)

A consumer-shaped page inside `AppShell`, at **375px** and **320px**, in four
combinations: a plain page wrapper and an `mx-auto` one, each holding either a
wide table (`content=table`, which carries its own scroller) or an unbreakable
string (`content=word`, which has none). Scripted in `drive.mjs`.

| Claim                                               | Observed                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The content container is exactly the content box    | container `clientWidth` == `<main>` `clientWidth`, all 8 combinations                                                                      |
| A wide table does not scroll the region sideways    | `main.scrollWidth == clientWidth`, +0px, all 4 table combinations                                                                          |
| The wide table scrolls inside its own container     | true, all 4                                                                                                                                |
| _(recorded, not asserted)_ the document-level check | `documentElement.scrollWidth == innerWidth` — green in **every** case, including the ones carrying 180px and 235px of real region overflow |

### What this settled, against the obvious reading

`min-w-0` was added to the shell's content container and then **measured to be
inert in this structure** — the harness reports identical numbers with and
without it, at both widths, under both wrappers. The automatic minimum size
applies to a flex item's MAIN axis, and `<main>` is a column, so that box's
width is already cross-axis stretch and cannot grow. It stays as the correct
declaration for the box (see the comment in `app-shell.svelte`), but it is not
what a reported sideways scroll comes from.

What the shell genuinely owns is the **blindness**, which is the last row above.
`<main>` has `overflow-y: auto`, and that makes `overflow-x` compute to `auto`
too, so it — not the document — is where a wide child's excess lands.
`document.documentElement.scrollWidth` therefore cannot move, which is how an app
carries real sideways scroll on a phone with its overflow suite green throughout.
`<main>` now carries `data-slot="app-shell-content"` so a consumer's own check
has a stable element to measure instead.

The remaining overflow (the `word` case: 180px at 375px, 235px at 320px) is a
child with no scroller of its own. No sizing rule in the shell can prevent that;
only the child carrying its own scroller can, as this package's `Table` does.

## Overlays holding more rows than fit (`?surface=long-lists`)

Every floating overlay this package ships, each opened over 36 rows, at **800px**
and **560px** viewport height. Scripted in `drive.mjs`.

Two heights, because one cannot tell a cap that tracks the space available from a
lucky constant: a static `max-h-96` passes at 800 and fails at 560, and the
bits-ui variable passes at both. The numbers below are the fixed build; the
figures in brackets are the same measurement before the fix.

| Overlay             | Content bottom vs window | Scroller                                                               | Last row reached                              |
| ------------------- | ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| select @ 800        | 800 vs 800 _(was 1068)_  | viewport `scrollHeight` 1008 > `clientHeight` 716 _(was 1008 == 1008)_ | top 772 after 292px _(was 1040, unreachable)_ |
| select @ 560        | 560 vs 560 _(was 1068)_  | 1008 > 476                                                             | top 532 after 532px                           |
| dropdown menu @ 800 | 800 vs 800 _(was 1070)_  | 1016 > 746 _(was 1016 == 1016)_                                        | top 767 after 270px _(was 1037)_              |
| dropdown menu @ 560 | 560 vs 560 _(was 1070)_  | 1016 > 506                                                             | top 527 after 510px                           |
| popover @ 800       | 800 vs 800 _(was 906)_   | 896 > 746 _(was 896 == 896)_                                           | top 759 after 150px _(was 865)_               |
| popover @ 560       | 560 vs 560 _(was 906)_   | 896 > 506                                                              | top 519 after 390px                           |
| command list @ 800  | 595 vs 800 _(unchanged)_ | 1188 > 288 _(unchanged)_                                               | top 559 after 900px _(unchanged)_             |
| command list @ 560  | 515 vs 560 _(unchanged)_ | 1188 > 288 _(unchanged)_                                               | top 479 after 900px _(unchanged)_             |

Select also asserts that `SelectScrollDownButton` renders at all. bits-ui mounts
it only while `viewportNode.scrollHeight - clientHeight > 0`, so on the broken
build it was absent — the popper ran off the bottom of the window and displayed
nothing saying there was more. Count went 0 → 1.

### The scroller is not always the element carrying the cap

Select is the exception and it matters, because measuring the wrong box calls a
working select broken. bits-ui lays the select's content out as a flex column and
gives the viewport `flex: 1; overflow: auto` inline, so the cap on the **content**
is what gives the **viewport** a height to be `1` of, and the viewport is what
moves. Read on the content, `scrollHeight > clientHeight` is 740 vs 740 — false
on the fixed build. The script asserts against `[data-select-viewport]` there and
against the content itself everywhere else.

This is also why the `h-(--bits-select-anchor-height)` on the viewport is inert
rather than harmful. That variable **is** set — 32px, the trigger's height — but
`flex: 1 1 0%` wins on the main axis of a column flex container, so the declared
height never applies. It only bites if something stops the content being a flex
column, which is bits-ui's to decide, not this package's.

### What this caught

`overflow-y-auto` was on the select's content, the dropdown menu's content, and
(as a scroll container with no cap) nowhere on the popover — and on all three it
did nothing, because nothing constrained the height for it to act on. There is no
way to see that by reading the class list: the utility is present, spelled
correctly, and inert. Every existing gate agreed the components were fine.

jsdom is structurally blind to it — with no layout, `scrollHeight` and
`clientHeight` are both 0, so `scrollHeight > clientHeight` is false on the fixed
build and the broken one alike, and a unit test asserting it would fail on the
fix. The compiled-CSS gates can prove `max-h-(--bits-select-content-available-height)`
compiles to a rule, but not that a box obeyed it.

Upstream shadcn-svelte is not the reference here, and that is worth recording.
It carried `max-h-(--bits-select-content-available-height)` on the select's
content at `1.0.0` and **dropped it** in the rewrite that moved utilities into
per-style `cn-*` classes: `cn-select-content` in the current `style-*.css` carries
no height cap, nor does `cn-dropdown-menu-content` or `cn-popover-content`
(`cn-menu-target`, the one remaining unknown in the class list, resolves to `dark`
or to nothing — it is a colour-mode marker, not a cap). Only `cn-command-list`
caps, at a static `max-h-72` under a `min()` with an `--available-height` nothing
in a dialogue sets. So this package's port was faithful; the omission is
upstream's, and the fix restores the `1.0.0` utility rather than following
current `main`.

Command's list is the one that was already right, and is left alone: `max-h-72`
genuinely constrains it, it scrolls, and its last row is reachable at both
heights. Its cap does not track the viewport, but at 288px it does not need to —
it is asserted at both heights precisely so that stops being an assumption.

## Nav ink against the chrome (`?surface=shell`, three palettes) — #11

The defect class this exists for: **a shared component painting a colour the
CONSUMER owns as ink**. `--ds-color-primary` is the one token the package invites
every app to override, and the only constraint stated where an app picks it is
that it clear AA against its own `-foreground` pair — the fill case. The shell
was additionally consuming it as text on its chrome, which is a stricter
requirement no app was told about, and which constrains a brand hue far more
tightly than the stated rule implies.

Scripted in `drive.mjs`. Three palettes × both themes, all driven against the
built package with the palette applied exactly as a consuming app applies it —
an override of the sanctioned surface and nothing else.

Method, because the number is only worth as much as how it was taken:

- **Resolved colours, not declared ones.** Every value comes from
  `getComputedStyle` in Chromium.
- **Composited against the real ancestor stack**, not against the page
  background. The active row's own background is a 12% `color-mix` over the
  chrome, and the chrome is `bg-shell/80` over the page — so the label sits on
  three layers, and measuring against any single one of them is wrong. The stack
  is painted into a 1×1 canvas and read back, which makes the engine do the
  blending; no colour-space assumption of ours can be off.
- **Transitions off.** `.ds-nav-item` transitions `color` over 150ms, and
  swapping a custom property STARTS that transition. The first run of this gate
  read mid-flight interpolated colours — serialised as `oklab()`, still most of
  the way back at the old hue — and reported the package default while believing
  it had applied the override. Every reading here is of a settled state.
- **The theme is waited on, never assumed.** Which one is on screen is the
  load-bearing fact of the whole section.

| Palette (light)                         | Active label BEFORE | AFTER       | As a fill (the documented constraint) |
| --------------------------------------- | ------------------- | ----------- | ------------------------------------- |
| package default `oklch(0.50 0.155 250)` | 4.55:1              | **12.60:1** | 5.75:1 ✓                              |
| warm amber `oklch(0.75 0.11 75)`        | **1.90:1**          | **13.87:1** | 7.69:1 ✓                              |
| saturated blue `oklch(0.62 0.18 250)`   | **2.87:1**          | **13.00:1** | 5.00:1 ✓                              |

Both fixtures satisfy the documented contract comfortably and were illegible
anyway — which is the entire argument for fixing it in the package. Dark mode
never failed (6.05–8.21:1 before) and is now 12.45–13.13:1. The nav badge was the
worst of the three, at 1.73:1 under the amber palette and 3.72:1 on the package
default; it is now 9.09–12.63:1.

| Claim                                                    | Why jsdom cannot make it                 | Gated at                                                         |
| -------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| The fixture palette clears AA as a FILL                  | unresolved `var(--…)`                    | ≥4.5:1 — if this fails the FIXTURE is wrong, not the shell       |
| The active nav label clears AA on its chrome             | no stylesheet, no `color-mix` resolution | ≥4.5:1                                                           |
| The nav badge count clears AA on its tint                | as above, over two stacked tints         | ≥4.5:1                                                           |
| The active state does not rest on the indicator alone    | no cascade, no computed weight           | `aria-current="page"` **and** weight 400→500 **and** ink differs |
| The brand indicator against the chrome                   | —                                        | recorded, not gated (see below)                                  |
| An inverted chrome moves the nav ink                     | a cascade fact — needs an engine         | ink ≠ the page's own, and ≥4.5:1 on the inverted chrome          |
| …and does NOT drag an in-page nav with it (`?pagenav=1`) | as above                                 | a nav in the page body stays exactly on the page's own ink       |
| The resting nav label clears AA                          | unresolved `var(--…)`                    | ≥4.5:1                                                           |

**Why the indicator bar is recorded and not gated.** WCAG 1.4.11 holds a state
indicator to 3:1 only when the state is not conveyed some other way. Here it is
conveyed three other ways, and the gate asserts that redundancy on every palette
rather than asserting the paragraph. So the bar and the underline keep
`--primary` at full strength and stay the one place an app's brand hue survives
undiluted: 1.90:1 on the rail and 2.08:1 on the header underline under the amber
palette, printed on every run.

**The resting label is asserted, not recorded — since #13.** It used to measure
3.62:1 in light mode, identically under all three palettes here because no
consumer colour is involved: it is painted in `--ds-color-muted-foreground`,
which was below the AA text floor on every light surface the token package
defines (`packages/design-tokens/tokens/tokens.tokens.json`, `palette.neutral.500`,
`0.600` → `0.520`). That was a token-package defect with estate-wide reach, not
an adjacent one-liner, so it was fixed there (#13) rather than folded into #11.
Now light mode measures **5.03–5.08:1** (rail/header) and dark **6.53–6.58:1**,
against the shell chrome surface (`surface-1`); design-tokens' own
`test/contrast.test.js` covers all four surfaces `muted-foreground` actually
paints on, including the worst case (`surface-3`, dark: 5.56:1), which is
narrower than this harness's single-surface reading but still clears AA.

**What this caught, beyond the reported defect.** Driving an inverted chrome
showed `--ds-shell-chrome-foreground` reached the nav not at all. A custom
property declared ON an element beats one inherited INTO it, and `.ds-nav` is a
descendant of every chrome surface — so the rail re-pointing `--ds-nav-ink` was
overridden by `.ds-nav`'s own declaration on the very element that consumes it.
Both declarations were correct in isolation; only their placement was wrong. No
compiled-CSS gate could see it, and no app could see it either, because both
sides default to the same token — the only symptom was an app inverting its
chrome and getting silence. This is the second time this package has shipped
that exact shape of dead affordance; `theme-coverage.test.ts` calls it "worse
than a missing key" and it was right.

The rule has to give **two opposite answers at once**, so both are asserted.
`AppNav` is also exported in its own right, for a navigation list inside a page
on the ordinary page background, and that one must NOT follow the chrome — an
inverted chrome would otherwise paint near-white ink on a near-white surface.
`?pagenav=1` puts one in the page body beside the inverted rail and pins both
halves in the same pass. Gating only the loud half would leave the quiet half free to
break silently, which is the shape of every defect this harness exists for.

One trap worth inheriting from writing that check: **a custom property and a
`color` resolve to the same colour and serialise differently.** `--foreground`
reads back as `oklch(60% .012 85)` where the `color` that consumed it reads back
as `oklch(0.6 0.012 85)`. A string compare between the two is a tautology that
passes on the broken build as readily as the fixed one, so both sides are
painted into the canvas and compared as pixels.

## The palette catalogue (`?surface=palette`) — #25

Twenty named OKLCH palettes, absorbed from the master project's standalone
shadcn showcase, which had carried them since 2026-03-11 and predated both
this package and `@poodle64/design-tokens` entirely (design-system#25; the
reasoning is `docs/development/decision-palette-catalogue-and-the-tone-axis.md`). A
palette here is two knobs — an **accent**, and a **tone** (a hue plus a
per-mode chroma scale) — projected at build time through the neutral ladder
in `tokens.tokens.json`. There is no field for a lightness, so the ladder's
lightness steps — the axis every contrast guarantee in this package is
computed from — cannot be reached from a palette.

The showcase's README advertised "WCAG AA compliance indicators" and gated
nothing. Measured on the way in: 13 of the 20 accent pairs were below the
4.5:1 AA fill floor (papyrus-gold 2.20:1, nile-teal 2.63:1, scribes-amber
2.71:1, each pairing a light accent with a near-white label); zinc's
`destructive-foreground` was byte-identical to its `destructive` — a 1:1
label on a button; and supabase declared the same `muted-foreground` in both
modes, so its dark mode used a colour picked against a white page. All of it
rendered perfectly happily for five months, because rendering was the only
thing anyone did with it.

`packages/design-tokens/test/palettes.test.js` holds the arithmetic half of
the gate, computed from the built stylesheet. Scripted here in `drive.mjs` is
the composited half: the same colours over the real ancestor stack a
component actually paints them on, which for the nav is three layers deep — a
12% tint over `bg-shell/80` over the page. A palette can satisfy flat
arithmetic and still be illegible on the surface a component paints it on —
that is exactly what #11 was, now asked of all twenty catalogued palettes
rather than three hand-written fixtures.

Method:

- **One page per theme, palettes swapped by attribute**, not one page load
  per palette. `document.documentElement.dataset.dsPalette` is set directly —
  closer to the thing under test, since a palette IS an attribute swap and
  nothing more. It depends on the shared SETTLE stylesheet: without
  transitions disabled, every reading after the first would be caught
  mid-flight between two palettes, the same trap #11 found first.
- **A no-palette baseline is read first.** Every check below is a MOVE from
  that baseline, not a value that happens to look plausible on its own —
  "the palette actually reaches the page" fails a palette block that never
  won the cascade, which would otherwise pass every contrast check below on
  the package's own colours.

| Claim                                                    | Why jsdom cannot make it                                                    | Observed                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The palette actually reaches the page                    | unresolved `var(--…)`, no cascade to resolve it against                     | primary or background differs from the baseline, all 40                                     |
| The status vocabulary is untouched                       | a resolved-colour comparison needs a cascade                                | all five status swatches identical to the default, all 40                                   |
| Body copy on a card clears AA                            | no stylesheet                                                               | ≥4.5:1, all 40                                                                              |
| Muted copy in a nested well clears AA                    | no stylesheet, no nested cascade                                            | ≥4.5:1, all 40                                                                              |
| Muted copy on the page ground clears AA                  | no stylesheet                                                               | ≥4.5:1, all 40 — tightest margin 5.24:1 (ithildin, mithril, silmaril-teal, supabase; light) |
| The accent clears AA as a fill, as the template requires | unresolved `var(--…)`                                                       | ≥4.5:1, all 40                                                                              |
| A real Button's label clears AA on its own fill          | not a synthetic probe — the claim is about the artefact a consumer installs | ≥4.5:1, all 40                                                                              |
| The active nav label clears AA on the chrome             | three-layer `color-mix` composite — #11's claim, under every palette        | ≥4.5:1, all 40                                                                              |
| The resting nav label clears AA on the chrome            | unresolved `var(--…)`                                                       | ≥4.5:1, all 40                                                                              |
| The nav badge count clears AA on its tint                | two stacked tints                                                           | ≥4.5:1, all 40                                                                              |

Every row above runs 40 times — 20 palettes × 2 modes. Across the whole
`drive.mjs` run — every surface, not just this one — that is part of 638
checks, all passing.

### What this caught

Driven red before being kept, the way every gate in this file is. Restoring
papyrus-gold's original near-white foreground — the exact defect the
catalogue's decision record fixed — fails both the fill check and the real
Button check at 2.19:1, and `drive.mjs` exits 1. `palettes.test.js` reports
2.20:1 for the same defect. The two layers agreeing to within 0.01 is what
says they are measuring the same thing by two different routes: one reading
the emitted stylesheet directly, the other reading a real page that had to
resolve `color-mix()`, inheritance and the cascade to get there.

## The avatar load state (`?surface=avatar`)

Three avatars driven over the real network: a URL that 404s, an inline image
that decodes, and no source at all. Scripted in `drive.mjs`.

| Claim                                                   | Observed                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| A source that cannot resolve falls back to the initials | `data-status="error"`, image `display: none`, fallback shown reading `OP` |
| A source that resolves takes over                       | `data-status="loaded"`, image `display: block`, fallback `display: none`  |
| No source at all still shows the initials               | fallback shown reading `OP`                                               |

jsdom loads no resources, so its half of this (`src/test/avatar.test.ts`) stubs
`Image` to fire the events bits-ui listens for. This is the leg where the request
genuinely fails and the picture genuinely decodes.

## Scoped theming (`?surface=theming`) — #8

The compiled-CSS gates in `src/test/theme-coverage.test.ts` prove a colour
utility resolves to the right value at the page root. They cannot prove it
resolves correctly in a SCOPED subtree, or under a SCOPED `.dark` wrapper,
because that is a cascade fact — which element a `var()` chain re-resolves
against — and neither a static compile nor jsdom's unresolved-`var()` stub can
see it. Only a real engine, with a real DOM and a real element to scope the
override on, can.

Three identical probe sets (`bg-background`, `bg-card`, `bg-popover`,
`bg-muted`, `bg-accent`, `bg-secondary`, `border-input`,
`text-muted-foreground` — covering both packages' halves of the surface): the
page default, a subtree overriding every `--ds-color-*` key those utilities
read to one colour, and a subtree carrying a scoped `.dark` class. Scripted in
`drive.mjs`.

| Claim                                                                              | Observed                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| The scoped `--ds-color-*` override reaches every utility in the subtree, uniformly | all eight slots resolve to the one override colour |
| That is a genuine move, not a coincidence                                          | none of the eight match the unscoped page default  |
| A scoped `.dark` wrapper moves the whole surface within it                         | none of the eight stay at the light root's value   |

### What this caught

Before #8's fix, this surface would have failed the first and third rows: a
subtree redeclaring `--ds-color-background` moved nothing (the utility read a
theme-name alias frozen at `:root`, one level removed from the token), and a
scoped `.dark` class moved nothing on either half of the surface for the same
reason. The fix ends the freeze — see `packages/design-tokens/sd.config.js`
(`css/tailwind-v4-theme`, `@theme inline`) and
`packages/ui/src/lib/styles.css` (the `@theme inline` fallback chains) — and
this is the only gate that can tell the difference between "the rule exists"
and "the rule re-resolves where an app actually scopes it".

## DetailPanel's title face (`?surface=detail-panel`) — #9

`titleFace` swaps a class (`font-mono` / `font-display`), and a class name is
not the claim: this package's other gates exist precisely because a Tailwind
utility can sit in the DOM with no compiled rule behind it, and jsdom cannot
resolve a `font-family` at all (`src/test/composed-chrome.test.ts` covers the
class-name half only). Two panels, one per supported setting. Scripted in
`drive.mjs`.

| Claim                                                       | Observed                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Default (`titleFace` omitted) resolves the mono/code family | `"JetBrains Mono", "JetBrains Mono Variable", ui-monospace, "SF Mono", monospace` |
| `titleFace="display"` resolves the display family           | `Fraunces, ui-serif, Georgia, serif`                                              |
| The two settings resolve to different families              | asserted directly, not inferred from the two rows above                           |

## Console-dashboard primitives (`?surface=console`) — design-system#15

The five console-dashboard primitives promoted from mission-command:
`ArcGauge`, `BarRow`, `Scorecard`, `Sparkline` and `StatusBadge`'s new
`primary` extension. Most of their claims (which attribute carries which
literal — an SVG `stroke-dashoffset`, a `.ds-dot-{status}` class, a computed
point coordinate) need no CSS resolution and are proved under jsdom in
`src/test/`; only the three claims below need a real cascade, so only those
are scripted here. Scorecard and Sparkline render on this surface for visual
completeness but carry no scripted check of their own.

| Claim                                                                                                                                 | Why jsdom cannot make it                                                                         | Observed                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| ArcGauge's `stroke` resolves to a real colour per tone (success/warning/error), not the unresolved `var(--ds-color-status-*)` literal | jsdom returns the literal and calls it a pass                                                    | three distinct resolved `rgb(...)` values                                                 |
| StatusBadge's new `primary` chip/dot resolve to a real colour, distinct from every shared five-state chip's                           | same — and `primary` is not in the shared `Status` type, so nothing else proves it paints at all | `--ds-color-primary`'s resolved colour, different from success/warning/error/info/neutral |
| BarRow's fill genuinely covers the percentage of its track `pct` asked for                                                            | jsdom has no layout, so "42% wide" and "0% wide with a `width: 42%` string" measure identically  | fill/track `getBoundingClientRect()` ratio within 2% of 42%                               |

## Phone/tablet chrome, driven by eye (`?surface=mobile-audit`)

A realistic composed page — a nine-section rail with two branches, the
`actions` slot carrying two StatusBadges, the real `AppIdentity` in the
`identity` slot, an eight-column `DataTableTanstack`, a six-card `TileGrid`
and a `ContextColumn` — the shapes an app actually ships together, rather
than one primitive at a time. No claim here is scripted: "does this read as
broken at 390×844" is a judgement, not a comparison a script can make (`core
/verification.md` "Scripts Drive, Models Judge"), so this exists to be looked
at — at 390×844, 768×1024 and 1440×900, in both themes — the way `console`
above exists for the five dashboard primitives it renders with no check of
its own.

Driving it caught three defects no scripted surface here was shaped to find,
because each needs several real components composed together under real
crowding, not one component in isolation:

- The leading/trailing search affordance kept its full label and shrank to
  whatever a `context` switcher or the `actions` badges left it — as little
  as one glyph, beside two StatusBadges at 390px, painting a button that
  read "S". It is icon-only below `sm`, matching the menu and theme-toggle
  buttons either side of it.
- `ContextColumn` hid outright below `xl` (1280px) — tablet included — with
  no way to reach the stats or the selected-row detail inside it. It now
  opens the same content in an `AppDialog` from a floating trigger.
- Nothing in the shell accounted for a device notch or a home-indicator
  gesture bar: `env(safe-area-inset-*)` reached none of the sticky bar, the
  full-height drawer or the scrolling content's own bottom padding.

## The loud-unknown rule, painted (`?surface=schema-form`)

`<SchemaForm>` over a pair of documents that is part-broken on purpose: a
Control carrying an unregistered `dropdown` hint, an `Accordion` element outside
the vocabulary, and a `retention` group no Control addresses. All three are the
live defect shapes from the renderers this component retires, where each one
made a field vanish in silence.

`src/test/schema-form-loud-unknown.test.ts` proves the flagged block is in the
markup. That is a weaker claim than "renders loudly": a fallback with no height,
or a border whose colour resolved to nothing, or a tint identical to the page
behind it would satisfy every jsdom assertion and reproduce the original defect
exactly — a field present in principle and absent on screen. jsdom cannot tell
those apart, since it returns the unresolved `var(--...)` literal and a zero rect
either way. So what is scripted here is paint and layout.

| Claim                                                                                    | Why jsdom cannot make it                                                                        | Observed                                                                          |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Each flagged block occupies real space                                                   | jsdom has no layout; every rect is zero whether the block is styled or not                      | three blocks, each wider than 100px and taller than 40px                          |
| Each flagged block paints a resolved, visible dashed warning border                      | jsdom returns `var(--ds-color-status-warning)` unresolved and calls it a pass                   | `dashed`, a resolved `oklab(...)`, contrast >= 1.3:1 against everything behind it |
| Both SHOW rules put their field on the page, and revoking one takes its whole Group away | this one CAN be made in jsdom and is, in `src/test/`; it is repeated here as a cheap regression | `tuning.depth` and `tuning.endpoint` present, then `depth` gone after the toggle  |

Driven by hand: change the value a rule reads and watch the Group animate in and
out; type into the flagged block's raw editor and confirm the value round-trips;
switch to dark and confirm the amber flag still separates from the surface.

## The library surfaces (`?surface=library`) — #30

The four fixed-prop library components driven as ONE consumer-shaped flow:
`LibraryBrowse` → a row click → `DocumentDetail` → a membership press →
`CollectionDetail`. The harness page plays the consuming app — it owns the
query, the facet selections and the "routing" (a state swap), exactly as the
no-fetch/no-router contract demands. The whole flow runs inside `AppShell`
because that is where every consumer renders these, and the 375px claim is
meaningless against a bare page.

| Claim                                                           | Why jsdom cannot make it                                                                              | Observed                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A row click lands a PAINTED document detail                     | jsdom fires the handler but has no layout to show anything legible appeared                           | the detail surface at real width and height, carrying the clicked title     |
| The detail's title and hash resolve their real families         | jsdom returns the unresolved class-name story; a dead `font-display`/`font-mono` utility passes there | Fraunces on the name-shaped title, JetBrains Mono on the content hash       |
| A facet press comes back as a visible chip and a pressed option | the re-render loop through the page's own state is real DOM paint, not a callback assertion           | `tags: property` chip visible, the option `aria-pressed`                    |
| At 375px the catalogue table scrolls inside its own container   | #5's blindness: jsdom reports scrollWidth 0 either way                                                | table 602px inside a 341px scroller; the content region gains +0px sideways |

## SearchResults (`?surface=search-results`) — #30

The one designed-not-extracted component. The highlight is its whole reason to
exist, and "renders a tint" is a paint claim: a `<mark>` whose colour resolved
to nothing — or to the page's own background — satisfies every jsdom assertion
and highlights nothing, which is `<SchemaForm>`'s silent-fallback defect
wearing a different mask. The acceptance's "renders under a consumer's own
tokens" is also measured here rather than asserted: the driver turns the one
sanctioned accent knob (`--ds-color-primary`) the way an app turns it, and the
painted pixel behind the highlight must move.

| Claim                                                    | Observed                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| The highlight occupies real space                        | a real rect, tens of pixels each way                               |
| It paints a resolved tint distinct from its ground       | a resolved `oklab(...)`, composited pixel differs from the stack   |
| It follows the consumer's own accent                     | the composited pixel moves when `--ds-color-primary` is overridden |
| The relevance figure resolves mono with tabular numerals | JetBrains Mono, `font-variant-numeric: tabular-nums`               |

## Nested navigation (`?surface=nested`)

A parent with fifteen children, labels deliberately longer than the rail is
wide, at `#/education/topic-3` so the group is open on first paint with nothing
clicked. The interaction logic is proved under jsdom in
`src/test/app-nav-nested.test.ts`; only the claims below need an engine.

| Claim                                                                         | Why jsdom cannot make it                                                                 | Observed                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A child label lines up under its parent's                                     | no layout; the indent is arithmetic over padding, icon size and a border                 | 52.0px vs 52.0px                                                                       |
| The guide border is a real resolved width                                     | jsdom resolves no stylesheet                                                             | 1px                                                                                    |
| The open chevron is genuinely rotated                                         | `transform` stays an unresolved literal, so a dead rule passes                           | `matrix(0, 1, -1, 0, 0, 0)`                                                            |
| A child row stays inside the rail                                             | no layout                                                                                | child right 235px vs rail right 248px                                                  |
| Nothing in the document exceeds the viewport at 360/320px                     | no layout at all                                                                         | 0 offenders, drawer 248px                                                              |
| The nav does not scroll sideways                                              | `scrollWidth`/`clientWidth` are both 0 without layout                                    | fits                                                                                   |
| A collapsed rail renders no tree                                              | the rail's collapsed width is a media/transition fact, and the claim is about that state | 0 branches, 0 controls, 0 child rows at 56px                                           |
| `prefers-reduced-motion: reduce` stops the chevron animating but NOT rotating | one half is a media query, the other a resolved matrix; jsdom sees neither               | `transition-duration` 0.15s → 0s, `transform` unchanged at `matrix(0, 1, -1, 0, 0, 0)` |

### The overflow check is a DOM walk, not `documentElement.scrollWidth`

The nav is `overflow-y: auto`, which computes `overflow-x` to `auto` with it. A
row wider than the rail therefore becomes a scrollbar **inside the nav**, and the
document-level number never moves — the same blindness `?surface=overflow`
documents for the content region, one component along. So the assertion walks
every element in `body` and compares each `getBoundingClientRect()` against the
viewport, and the naive number is printed beside it, unasserted, for contrast.

### What this caught

The walk's first run reported 82 offenders at 360px, the entire drawer subtree at
`left: -248`. That was not overflow: `ds-drawer-in` animates from
`translateX(-100%)`, and the measurement was being taken on the frame after the
click. The fix is to wait for `document.getAnimations()` to settle before
measuring, which is what makes the 0 meaningful rather than tuned. The same wait
was then needed on the collapsed rail, whose 200ms width transition was being
read at 243px and read as though the collapse had not happened.

## The content measure (`?surface=measure&measure=<tier>`)

One page body rendered at each of the four tiers, so the only thing that can
move a measured width is the prop. Driven at 2560px (the viewport that motivated
the feature), 1440px (where the wide tiers must be inert) and 360px. Scripted in
`drive.mjs`.

Every claim here is a resolved LENGTH, which is why none of it can be made under
jsdom: `max-width` comes back as the unresolved `var(--ds-shell-measure-*)`
literal, `ch` resolves against a font that was never loaded, and every rect is
zero, so a unit test would pass against a build whose stylesheet was never
imported. A class-name assertion is not a width measurement.

| Claim                                                                          | Why jsdom cannot make it                                                                    | Observed                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `full` leaves the box at the whole available width                             | no layout; `max-width: none` and a bound cap measure identically                            | 2312 of 2312px, `max-width: none`                           |
| `page` renders at 80rem, against the root font size the document resolved      | rem resolution is a cascade fact                                                            | 1280px vs 80 × 16px                                         |
| `wide` renders at 120rem                                                       | same                                                                                        | 1920px vs 120 × 16px                                        |
| `prose` renders at exactly `72ch` **in the box's own face**, measured by probe | `ch` is the advance of the `0` glyph in a loaded font; jsdom loads none                     | 668.16px vs a 72ch probe at 668.16px                        |
| `prose` puts running text in the readable 45–90 character band                 | characters-per-line is text layout, the thing jsdom most completely lacks                   | **80 characters per line, against 311 at `full`**           |
| The scale widens strictly, narrowest first                                     | no layout                                                                                   | 668.16 < 1280 < 1920 < 2312                                 |
| A capped box is centred, not flush left                                        | auto margins inside a flex column resolve only in an engine                                 | gaps equal to 0.01px at every tier (821.92/821.92 at prose) |
| A cap is a ceiling, never a floor — `page`/`wide` change nothing at 1440px     | whether a cap binds depends on available width, which requires layout                       | 1192px at `page`, `wide` and `full` alike                   |
| No tier introduces sideways scroll at 360px                                    | the content region is its own scroller, so the document-level number cannot move (see `#5`) | 0 offenders, `main` overflow 0px, all four tiers            |

### Additivity, measured against the pre-change build

The operator's hard constraint on this feature was that no consumer omitting
`measure` may render one pixel differently. That is asserted permanently in two
places — `src/test/app-shell-measure.test.ts` holds the DOM half, and the three
`a shell that never names measure is uncapped and unmoved` checks above hold the
pixel half at 2560/1440/360px — but neither can compare against a build that no
longer exists, so the cross-build diff was done out of band.

`dist` and the harness were built at the pre-change commit, the `shell`,
`overflow` and `nested` surfaces captured at 2560px, 1440px and 360px, and the
same capture repeated on this build. Compared per surface/viewport pair: the
whole `<main>` subtree's `outerHTML`, the content box's class string, its full
attribute set, its measured width, its offset inside `<main>`, and its computed
`max-width`, `margin-left`, `margin-right` and padding.

All nine pairs identical on all ten fields — not "no visible difference", but the
same markup and the same numbers. `measure="full"` passed explicitly is checked
against the omitted case in the same run, since a consumer adopting the scale and
then wanting one layout uncapped must land back where they started.

### The character band is font-robust, measured across faces

A fixed character band would be a fragile assertion if the number moved with
whatever face the runner happened to resolve — CI is `ubuntu-latest` and picks a
different fallback than a Mac. So it was driven across eight faces at 2560px,
including the metric extremes:

| Face                                                                      | Box width | Characters per line |
| ------------------------------------------------------------------------- | --------- | ------------------- |
| harness default (Avenir Next)                                             | 668.16px  | 80                  |
| DejaVu Sans / Liberation Sans / Ubuntu / Arial / monospace / `sans-serif` | 640.69px  | 80                  |
| Times New Roman                                                           | 576px     | 75                  |

The BOX moves by 92px across that set; the characters on a line move by five.
That is the property that makes `ch` the right unit for this tier rather than a
coincidence: the cap and the glyph advance scale together, so the measure holds
its meaning in a face nobody anticipated. The 45–90 band has margin on both
sides at every face tried, so it is a real bound rather than one tuned to the
number this machine happens to produce.

`readGeometry` awaits `document.fonts.ready` before measuring, and prints the
resolved family beside the count. The harness ships no `@font-face` at all —
it compiles the consumer's stylesheet over the built package, and the body stack
falls through to a locally available face — so that await is a no-op today. It
is there because the day this harness self-hosts a face, every number here would
begin being read a frame early, and that would surface as a CI flake rather than
as anything a reader could diagnose.

### Why `prose` is a tier rather than the narrow end of `page`

The measurement above is the argument. At 2560px with no cap, the same paragraph
runs to **311 characters per line**; the accepted band for continuous text is
45–90. A shared measure that shipped one page-frame width and let running text
span a 4K panel would be worse than the fifteen hand-written caps it replaces,
because it would be worse _everywhere at once_ and no page could opt out without
going back to writing its own width. `prose` is stated in `ch` rather than `rem`
for the same reason: a reading measure is a count of characters, so it has to
track whatever face and size the app actually set.

## The content texture (`?surface=texture&texture=<grid|none>`)

One shell, one 3200px page body, the texture the only variable. Scripted in
`drive.mjs`; `?blank=1` strips the copy so the driver can photograph bare floor.

Almost nothing this feature claims survives outside an engine, and more of it
needs a compositor than a layout. The picture is a resolved `background-image` —
two `color-mix()` gradients over the app's own palette — and jsdom returns an
empty string for that whether the stylesheet was imported or not. "Sits behind
content" is a paint order. "Travels with the scroll" is `background-attachment`,
which has **no DOM trace whatsoever**: the markup, the class and every attribute
are identical whether the floor moves with the page or hangs motionless behind
it. "Does not print" is a media state.

| Claim                                                                      | Why jsdom cannot make it                                            | Observed                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A named texture resolves to two real gradient layers on the content region | `background-image` is empty in jsdom whether or not the CSS loaded  | 2 `radial-gradient` layers                                         |
| Both inks resolve through their `var()`/`color-mix()` fallbacks            | no cascade; an unresolvable chain is silently invalid, not an error | no `var(` and no `color-mix(` survive: `oklch(0.5 0.155 250/0.06)` |
| The floor travels with the content, not with the box                       | `background-attachment` has no DOM trace at all                     | `local, local`; measured by photograph below                       |
| The scroller carries it; the measured box does not                         | needs the resolved background on each element                       | `main` class+`data-texture`, box `background-image: none`          |
| No element is added, and the region still scrolls                          | jsdom has no layout, so it reports 0 scroll either way              | 1 child, `overflow-y: auto`, 2570px of scroll                      |
| An app override of `--ds-shell-texture-grid-ink` reaches the painted grid  | custom-property resolution at the point of use is a cascade fact    | `rgb(11, 22, 33)` present in the computed value                    |
| An override of `--ds-shell-texture-grid-pitch` reaches the tile size       | same                                                                | `background-size: … 48px 48px`                                     |
| An override of `--ds-shell-texture-vignette-at` moves the corner glow      | same                                                                | `at 15% -10%`, with no `at 85%` left                               |
| RTL, a 24px root font size and `forced-colors: active` cost it nothing     | no layout, no media emulation, no direction resolution              | painted, `scrollTop` 400, 0px sideways in all three                |
| An opaque card renders **identically** with the texture on                 | paint order; only a compositor knows what is above what             | card interior byte-identical (8891 vs 8891 bytes)                  |
| …while the floor beside that card does change                              | the control for the row above                                       | differs                                                            |
| The texture intercepts no pointer events                                   | jsdom's `elementFromPoint` has no boxes to hit                      | the button hit-tests as itself; bare floor hits inside `main`      |
| On paper the texture is suppressed and the region goes white               | a media state, and a resolved background                            | print: `background-image: none`, `rgb(255, 255, 255)`              |
| …and comes back on screen                                                  | same                                                                | restored identical                                                 |
| No sideways scroll is introduced at 1440px or 360px                        | the content region is its own scroller (see `#5`)                   | `main` overflow 0px at both                                        |
| The region still scrolls under the texture                                 | no layout                                                           | `scrollTop` settles at 500 at both widths                          |
| The nav drawer still paints over a textured content region                 | stacking order                                                      | a point inside the open drawer hit-tests inside it                 |

### The floor moves, observed at two instants — with a control

The failure this exists to rule out is the one both surveyed apps have shipped at
some point: a texture pinned to the scroll container's border box, hanging
motionless while the page slides over it. A scroll container's background
defaults to `background-attachment: scroll`, which does exactly that, so this is
the easy mistake rather than an exotic one — and **every other check in this repo
is blind to it**, because the DOM is identical either way.

So it is observed rather than asserted. A 600×200 strip of bare floor is
photographed, the content region is scrolled by 15px (half the 30px grid pitch,
where the dot rows land exactly between their previous positions), and the same
strip is photographed again. The two buffers differ.

The **control** is the half that makes that mean anything. `background-attachment:
scroll` is then forced back on, on the same page, and the same two photographs
are taken again: identical. Without it, "the buffers differ" would be an
unfalsifiable claim about a probe that might simply be noisy; with it, the probe
is shown to distinguish the two states it exists to distinguish.

### Behind content, proved by a card that does not move

`pointer-events: none` is the guarantee everyone remembers to ask for, and it is
the weaker half. The failure that actually shipped is a texture painting **above**
content: an absolutely positioned `::before` inside the scroller — the shape both
surveyed apps reached for first — is a positioned box at `z-index: auto`, so it
paints over every non-positioned descendant. At 6% ink nobody catches that by
eye, which is precisely why it survived in two codebases.

The assertion is therefore a photograph of an opaque card's interior with the
texture on and off: **byte-identical, 8891 bytes both**. The floor beside the same
card, photographed in the same pass, differs — so the comparison is demonstrably
capable of seeing a texture when there is one. A background layer earns that
result by construction rather than by declaration: it cannot be hit-tested, it
always paints beneath every descendant, it adds no box to the flex column, and it
opens no stacking context.

### Additivity, measured against the pre-change build — now a script

The operator's hard constraint, the same one `measure` was held to: no consumer
that does not ask for a texture may render one pixel differently. Asserted
permanently in `src/test/app-shell-texture.test.ts` (the DOM half) and in the
three `a shell that never names texture paints none` checks above (the resolved-
background half), but neither can compare against a build that no longer exists.

That cross-build half used to be done by hand and written up here as a
paragraph — for `level`, for `children` and for `measure` — and a paragraph is
where the claim went to die: "all nine pairs identical on all ten fields" gave
the next reader no way to re-derive it, which adversarial review correctly called
an unverifiable claim as shipped. So the procedure is now `additivity.mjs`:

```sh
node harness/additivity.mjs                # against the previous commit
node harness/additivity.mjs ui-v2026.8.3   # against a released tag
```

It builds the package at the base ref in a throwaway git worktree (a full
install, deliberately: borrowing this checkout's `node_modules` would resolve the
workspace links back into current sources and silently build the "base" from the
new code), renders the five surfaces an existing consumer already has — `shell`,
`shell&pagenav=1`, `overflow`, `nested`, `measure&measure=page` — at 2560px,
1440px and 360px, and diffs, per pair: the whole `<main>` subtree's `outerHTML`,
its full attribute set, the content box's attribute set, `<main>`'s computed
`background-image`, `background-color`, `background-size`, `background-repeat`,
`background-attachment`, `background-position`, `position`, `overflow-x`,
`overflow-y`, `display`, `flex-direction`, `isolation` and `z-index`, the box's
computed `max-width`, margins and padding, eight geometry numbers, and the
rendered screenshot. It exits non-zero on any difference and names the field.

**Against `ui-v2026.8.3`: 15 pairs, 105 compared fields, identical on every field
and every pixel.** Not "no visible difference": the same bytes.

Driven red before being kept, the way every other gate here is: against
`ui-v2026.8.0` — two features back — it reports **19 differences**, exits 1, and
attributes them to `nested` and `measure`, which is exactly what those two
releases changed.

The surfaces are deliberately the opt-in-free ones. Adding a surface that names
`texture` or `measure` would defeat the point: the only question this asks is
what happens to somebody who did not ask for anything.

It is not wired into `pnpm test` — it installs and builds a second copy of the
package, so it is minutes rather than seconds, and it is meaningful only on a
change claiming to be additive. Run it before releasing one.

The feature also adds nothing to a consumer's `:root`. All four knobs are read
through `var()` fallbacks at the point of use rather than aliased at `:root`
(design-system#8 — an alias holding a `var()` reference resolves once, at
`:root`, where a scoped override can never reach it), so what a non-adopting
consumer's stylesheet gains is two rule sets whose selector matches nothing.

## The control density ramp (`?surface=palette&density=<comfortable|compact>`)

Button's heights were hard-coded Tailwind classes (`h-10`, `size-10`, `px-4`), so
no token could reach them. The consequence was not a wrong pixel — it was a
missing knob: an app whose controls run at 28-32px could not adopt this package's
Button without every row growing, and it forked six directories rather than take
that. Five of the six (`dialog`, `alert-dialog`, `command`, `input-group`,
`form`) were identical to this package's but for which Button they import.

The ramp is `--ds-control-*` tokens now, moved as a set by one attribute:

```html
<html data-ds-density="compact"></html>
```

Two claims are driven, and the second protects every existing consumer:

| Rung      | comfortable        | compact            |
| --------- | ------------------ | ------------------ |
| `xs`      | 28px / 10px / 6px  | 24px / 8px / 4px   |
| `sm`      | 36px / 14px / 8px  | 28px / 10px / 6px  |
| `default` | 40px / 16px / 12px | 32px / 12px / 8px  |
| `lg`      | 44px / 20px / 12px | 36px / 16px / 10px |

(height / inline padding / the trim beside an icon; the `icon-*` sizes are
squares of the same heights.)

The comfortable column is transcribed from the classes this change deleted —
`h-10` is 40, `px-4` is 16, `pr-3` is 12 — so a later tidy-up of the ramp fails
here rather than in somebody's app. Only an engine can read any of it: the value
is a `var()` chain and jsdom hands back the literal `var(--ds-control-height-md)`
for every one.

Three further checks say what the knob does NOT do. `Input` stays at its own 32px
under both densities, so `compact` is a density rather than a second undeclared
design. A `data-ds-density="comfortable"` subtree inside a compact page returns
to 40px, which is a cascade fact nothing in the markup states. And at `compact` a
default Button and an Input are the same height — which is why the compact
numbers are those numbers: it is the alignment the forking app was hand-pinning
on 75 call sites.

### The measurement trap, again, in a new costume

Reading the box in the SAME task as the attribute write returns the OLD height
while `getPropertyValue` already returns the new token — 2.5rem on the element,
32px in the layout. It reads exactly like a dead knob. The check waits a turn,
for the same family of reason as `SETTLE` and the #18 focus-ring note: a value
read mid-recalc is not the value a reader sees.

## The unmapped `data-state` values (`?surface=palette`)

`data-checked:` compiles to `&[data-checked]`, and bits-ui emits
`data-state="checked"` and never a bare `data-checked`. So in a consuming app
every checked checkbox painted no fill — grey border, dark tick on a transparent
ground, nine on one route — and every tab strip rendered its selected trigger
identically to the rest, on eleven routes. Months in production, because the
class was in the DOM the whole time and only the rule was missing.

Driven in both schemes, as composited fills rather than class names:

- a checked box does not paint the same as an unchecked one (≥16/255 apart);
- an **indeterminate** box paints the same fill as a checked one — it carried
  none before this release, so a tri-state checkbox showed its dash in the
  foreground ink on a transparent ground, the identical defect one value along;
- a selected tab does not paint the same as an unselected one (≥8/255 apart);
- and the fill **follows `--ds-color-primary`** when the app retunes it.

That last one is the check that pins the fix rather than the symptom, for the
same reason it was needed for the card hover (#24): two colours can differ for
the wrong reason, and only a retune tells a real primary fill from a coincidence.

## The pointer target on a 16px control (`?surface=palette`)

WCAG 2.5.8 asks for 24x24. A checkbox is 16 and a switch track is 20, and neither
is going to grow — the tick has to sit where a reader expects it. The answer is a
transparent `::after` skirt, and hit-testing is the only honest test of one: a
class assertion cannot tell a skirt that paints from one that receives a click,
and `getBoundingClientRect` cannot see a pseudo-element at all.

Measured: **29x29px around a 16x16px checkbox**, and **35x31px around a 36x20px
switch track**. The painted sizes are asserted too — a skirt that worked by
growing the control would have solved the wrong problem.

### The target is walked, not probed at a chosen offset

The first version hit-tested at ±14px and reported the switch as failing. The
skirt is inset from the PADDING box, and the track carries a 2px transparent
border, so its real reach is the inset minus 2 on each side and ±14 was landing
exactly on the boundary. The check now walks outward a pixel at a time and
reports what it finds, which also caught that `-inset-1.5` gives a 25px target —
clearing the 24px floor at a 16px root and missing it at a 14px one, since the
floor is in absolute CSS pixels and the skirt is in rem. Both skirts are
`-inset-2`.

`elementFromPoint` returns `null` outside the viewport, and `null` is
indistinguishable from "nothing there". Every control is scrolled to the middle
of the viewport before it is walked; without that the switch read as having no
skirt at all, purely because it sat 6px below the fold.

## The dropdown edge and the `--bits-*` variables (`?surface=long-lists`)

`border-[--border-strong]` is not a syntax error and not a dead class. It
compiles — to `border-color: --border-strong`, which is not a colour — so the
declaration is dropped and the border falls back to `currentColor`. A dropdown
menu drew its edge in whatever ink its text happened to be, and nothing reported
it, because the class is in the DOM and a rule exists. The only reading that can
fail is the RESOLVED border colour, checked here against both the ink it would
otherwise have taken and the token it should equal.

The `--bits-*` variables ride along on the same page. They are the popover's
documented height cap and zoom origin, and a name bits-ui does not set makes the
whole declaration invalid at computed-value time — the cap simply does not apply.
All seven names this package reads check out against bits-ui 2.18.1: the
`--bits-floating-*` set is written on the floating wrapper, and
`getFloatingContentCSSVars(name)` aliases it per component onto the content
inside. `src/test/theme-coverage.test.ts` derives the valid set from
`node_modules` rather than trusting a table; this is where they are shown to
RESOLVE — `max-height: 848px`, `transform-origin: 144px 0px`.

## The Svelte/bits-ui pairing (no surface — a sweep)

A report reached this package that **every** bits-ui overlay was silently dead on
Svelte `5.53.5` with bits-ui `2.18.1` — with a type check, a lint, 257 unit tests
and a production build all green — and that moving to `5.56.2` fixed it. The ask
was to encode that as a peerDependency floor.

It was swept before being encoded, in an isolated project holding nothing but
`bits-ui@2.18.1`, one Svelte version, and the four overlay families, driven in a
real browser:

| Svelte                                      | dialogue | menu | popover | select |
| ------------------------------------------- | -------- | ---- | ------- | ------ |
| 5.30.0, 5.32.0                              | open     | open | open    | open   |
| 5.33.0, 5.50.0, 5.51.0, 5.52.0              | open     | open | open    | open   |
| 5.53.0, 5.53.4, **5.53.5**, 5.53.6, 5.53.13 | open     | open | open    | open   |
| 5.54.0, 5.54.1, 5.55.0, 5.55.10             | open     | open | open    | open   |
| 5.56.0, **5.56.2**, 5.56.8                  | open     | open | open    | open   |

Every version opened every overlay. The same sweep under jsdom agreed. A
duplicate-instance hypothesis — two live Svelte copies in one graph, the classic
cause of a silently broken `getContext` — was built deliberately (bits-ui given
its own nested `svelte@5.56.2` under a root `svelte@5.53.5`), with Vite's Svelte
dedupe both on and off, and every overlay still opened.

So `>=5.56.2` was **not** encoded: it is not reproducible, and a floor that locks
consumers out of a range measured to work is a worse defect than the one it
claims to prevent. The declared floor moved from `^5.0.0` to `^5.33.0` instead —
the floor bits-ui itself requires, and the lowest version this sweep covers.
`5.25.0` does not build with the current `@sveltejs/vite-plugin-svelte` at all,
so the range below the floor is not silent.

What replaced the version range is the scripted overlay gate above. A range can
only express a break someone has already characterised; driving the four overlays
on every CI run catches the class of defect whatever causes it.
