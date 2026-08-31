# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is CalVer (`YYYY.M.x`).

## [2026.8.17] - 2026-08-31

### Added

- **The Formsnap form wrapper set ships here (design-system#16).**
  `@poodle64/ui/form` exports `Field`, `Control`, `Label`, `Description`,
  `FieldErrors`, `Fieldset`, `Legend`, `ElementField` and `Button`, each also
  under a `Form`-prefixed alias.

  Three apps had vendored the same nine files. Reconciled before promoting
  rather than picking one: the diff between two of them was **quote style**,
  and between those and the third was which package the shared `cn` and `Label`
  were imported from. Nothing had substantively diverged, so the union is one
  copy — but each app owned its own ARIA wiring, which is the part that made
  this worth owning centrally. The issue named three consumers; a fourth
  (`pebblestone`, whose copy predates the issue by four months) was found while
  reconciling, so the count was already understated when it was filed.

  `formsnap` and `sveltekit-superforms` are **optional** peer dependencies: an
  app that renders no form installs neither, and the other 54 components are
  unaffected.

  Classified as its own situation in the component map rather than added to
  `primitives`. That is deliberate and load-bearing: the consumer-side
  `check-ui-drift.mjs` gate treats a primitive as something an app may keep
  locally, so filing it there would have shipped the component while
  guaranteeing no app ever noticed it could drop its copy.

  The tests assert the WIRING, not the markup — the label resolves `for` to the
  control's generated id, `aria-describedby` reaches the description and the
  error node, an errored field flips `aria-invalid` and marks the label
  `data-fs-error`, and `Form.Button` carries `type="submit"` without the call
  site saying so. Driven red first: removing `{...props}` from the label and
  the type from the button failed three of the six. A test on class strings
  would have passed against all three vendored copies while any one of them
  silently stopped pointing at its own error node.


- **`PageHeader` gains `icon` and `meta` snippets (design-system#21).**
  Promoted on duplication rather than on request, which is the household test:
  three consumers had hand-rolled the meta row (a wrapped row of facts under
  the title) and two the icon square, and one had reimplemented the whole
  component locally to get them — 38 of its 49 page headers pass an icon, 12 a
  meta row.

  `icon` takes the **glyph alone**. The tinted square around it, its size, its
  radius and its alignment against the title belong to this component, because
  the treatment is the half that drifts: the two apps that built the square had
  already picked two different sizes for it. `meta` renders as one wrapped row
  in muted small text.

  Both are additive and neither is a breaking change: a header that names
  neither renders exactly as before, gated by a case that asserts the square is
  absent from a header that does not ask for it while the same query finds it
  on one that does.

### Changed

- **`eyebrow` stays, and is documented as an exception rather than an ordinary
  slot (design-system#21).** The issue asked for a decision between retiring it
  and documenting it, on the premise that the app which raised it had already
  stopped passing it and nothing was lost. That premise did not survive a
  census: **47+ call sites across seven of eight consumers** still pass it,
  including two in the very app the report said had stopped. Retirement is
  therefore a breaking change with live victims across the estate rather than a
  free removal, and it is not one this package should make on its own.

  What is real in the report is the default-ness. A kicker above a heading is
  among the more reliable tells of generated UI, and one audited app passed it
  on all 17 of its headers — one rendering "AIR 6015 · CASPO Workbench" above a
  title reading "Workbench". So the README now says what it is for and lists
  `subtitle`, `info`, `meta` and `breadcrumbs` as the places the fact usually
  belongs instead. No code change, and no consumer has to move.


- **`.ds-measure`, the content measure without the centring
  (design-system#22).** The scale solved "six different max-widths across nine
  routes" at the page level, but a route legitimately set to `wide` usually
  also carries explanatory prose, and that prose inherited the wide measure —
  13 findings of text running to ~123 characters a line on a single route in
  one consumer, against a stated reading measure of 72ch.

  `.ds-shell-measure[data-measure="prose"]` looked like the answer, since it is
  a plain class plus an attribute, but it carries `margin-inline: auto` and
  visibly indented a set of left-anchored paragraphs ~207px from their own
  label. Centring is correct for the shell's content box and wrong for a block
  within a page, so the measure and the centring are now two classes rather
  than one: `.ds-measure` caps, `.ds-shell-measure` caps and centres. Same
  attribute, same custom properties, no component change and nothing to migrate.

  It matters because of what apps do instead. Four of nine consumers had
  written ten local `max-w-prose` / `max-w-[68ch]` / `max-w-[72ch]`
  declarations between them and **not one matched this package's own 72ch** —
  the exact drift the scale exists to prevent. One had already found the
  workaround of reaching for `max-w-(--ds-shell-measure-prose)` directly, which
  is right and is now a supported class instead of a trick.

  Gated at 2560px on a `wide` route: the cap binds, the block stays on the
  page's own left edge, and it follows a retune of `--ds-shell-measure-prose`.
  The centring check was driven red by swapping the fixture to
  `.ds-shell-measure`, which moved the block 620px inward.

### Fixed

- **A clickable card has a hover state again (design-system#24).**
  `--color-accent` and `--color-card` both resolved to `--ds-color-surface-2`,
  so the standard `hover:bg-accent/50` treatment mixed a colour at 50% over a
  ground identical to it — a no-op by construction, in every app that made a
  card clickable. The reader got no confirmation that a card was interactive
  before committing to a click.

  `--color-accent` is now a **12% tint of `--ds-color-primary`**, which is not
  a new invention: it is the fill the active nav row already wears, and the
  same idiom as the `SearchResults` match highlight. A translucent tint
  composites over whatever ground it lands on, so one value serves a card, a
  row and a menu item, and it follows an app's own accent.

  This also fixed a second, unreported case. `bg-accent` is what this package's
  own dropdown, select and command items use for their highlight, and those sit
  on a popover — which, once #17 gave the light ladder real steps, the old
  accent would have matched at 1.03:1.

- **`AppShell`'s `texture` prop is documented as defaulting to `grid`
  (design-system#20).** The default moved in `2026.8.8` and the CHANGELOG
  recorded it, but the README went on selling `none`-by-default as a feature in
  two places, so the two contradicted each other. `collapsible`'s default is
  stated there now too.

### Added

- **A keyboard-focus gate on `Button` (design-system#18).** Drives real Tab
  navigation and asserts the **computed** `box-shadow` paints a ring — not
  `--tw-ring-shadow`, which reads correct whether or not anything is on screen.
  Driven red by removing `focus-visible:ring-3`.

  The report it came from — "the box-shadow never renders, regardless of ring
  colour" — is not reproducible; the ring paints at `oklab(0.5 … / 0.5) 0 0 0
  3px` with the border taking the ring colour, and a focused button photographs
  differently from a blurred one. It was a measurement artefact worth recording:
  `Button`'s base carries `transition-all` at 150ms, so a `getComputedStyle`
  read taken in the same turn as the focus returns the transition's START value
  — a transparent shadow and a transparent `border-top-color`, exactly the
  symptom described, and one no change to the ring COLOUR can move, which is
  why swapping it "had no effect". The gate is kept anyway: its absence is what
  let the question be asked at all.

- **A pointer-driven hover gate in `harness/drive.mjs`**, in both colour
  schemes. It composites the resting and hovered fills of a real card and
  asserts they differ, that the largest channel shift is at least 4/255, and
  that the hovered fill **moves when `--ds-color-primary` is retuned**.

  The third assertion exists because the first two passed against the broken
  build. Once #17 lifted the card off the page, `bg-accent/50` did differ from
  rest — for the wrong reason, since 50% alpha over a card whose fill equalled
  the accent simply let the page show through, fading the card toward the page
  instead of tinting it. Distinctness alone cannot tell a tint from a hole.
  Retuning the accent can.

- Two unit-level guards in `theme-coverage.test.ts`: `bg-accent` derives from
  `--ds-color-primary` rather than any surface rung, and does not resolve to
  the same colour as `bg-card`. Both are value comparisons, because this defect
  passes every structural check.

### Changed

- The scoped-theming gate holds `bg-accent` apart from its
  "every utility resolves to the one override colour" claim and asserts
  separately that the tint follows the override. Accent is no longer an alias
  of a surface rung, so under an override setting every key to one colour it
  lands on that colour **at 12% alpha** rather than on the colour itself.

## [2026.8.16] - 2026-08-31

### Added

- **The household's Australian value formatters, once: `@poodle64/ui/format`.**
  Two apps had hand-rolled the same job — `godswood/frontend/src/lib/utils/
  formatters.ts` (with its own tests) and `pebblestone/frontend/src/lib/utils/
  format.ts` (still app-owned after its design-system adoption pass, precisely
  because this package shipped nothing) — and had already drifted on every
  decision that matters. All four disagreements are user-visible, and the fleet
  is entirely Australian, so the divergence bought nothing:

  | Decision | godswood | pebblestone | Shipped |
  | --- | --- | --- | --- |
  | Percentage input | `4.5` → `4.5%` | `0.045` → `4.5%` | Both, named apart: `formatPercentage` (points) and `formatRatioAsPercentage` (ratio) |
  | Money input | dollars, `number \| string` | integer cents | Both: `formatCurrency` and `formatCurrencyFromCents` |
  | Money decimals | 0 by default | 2 by default | 2 — dropping cents is a loss of fidelity the caller asks for, not the default that rounds $1,234.56 up to $1,235 |
  | Date shape | `19 Dec 2024` | `19/12/2024` | Both, on one function: `formatDate(v, { format })`, default `short` |
  | Missing value | `N/A` | `-` | `N/A`, with `fallback` on every formatter — beside a money column, `-` reads as a minus sign |
  | Negative money | Intl's own | sign outside the symbol | Sign outside the symbol, everywhere, including `compactCurrency` (which rendered `A$-1.5m`) |

  Also settled: a **negative-currency** and a **non-AUD** rendering. AUD stays a
  bare `$`; a foreign currency renders disambiguated (`USD 1,234.56`) rather
  than as a second `$`, because the app holding a foreign account is exactly the
  one that must not confuse the two. `compactCurrency` now derives its prefix
  from the same `Intl` call the full formatter uses, so the axis and the table
  can no longer disagree about the symbol — the lifted version carried its own
  `A$`/`US$` map.

  **Timestamps are read in `Australia/Brisbane`**, not the browser's zone
  (`timeZone` overrides it). The household's books are kept in AEST, so a laptop
  in another zone should not renumber them; it also makes the output
  deterministic, which is why the tests here assert exact strings where
  godswood's had to settle for `toMatch(/19/)`. A **date-only** value gets no
  zone conversion at all — a date is not an instant, and converting one is how a
  booking dated the 1st shows as the 31st. That is a latent fix: the lifted
  `formatDate` parsed `2024-01-01` as UTC midnight and then read local getters.

  `parseApiDate` is exported alongside them. Both apps had independently found
  the same trap — a backend storing naive UTC serialises with no offset, and
  JavaScript reads that as LOCAL time, so in Brisbane anything after 2pm UTC
  shows the wrong DAY — and pebblestone's is the better-guarded of the two.

  Parsing is `Number`, not `parseFloat`, so `'12abc'` falls back instead of
  rendering `$12`: corrupt data should not arrive looking plausible.

  **Deliberately not promoted** — one consumer each, and a domain vocabulary
  rather than a shared value class: file sizes, AI model names and loan
  repayment frequencies (godswood); pager arithmetic and the per-line GST
  recompute for bill approvals (pebblestone, and bound to Xero tax codes
  besides — GST is arithmetic here, not formatting, and only one app does it).
  Relative time is out for a second reason: it rides on `date-fns`, and a
  display formatter is not worth making that a dependency of every consumer.
  Also not promoted, and recorded so it is not re-litigated: a table pager and a
  truncation component (pebblestone has them, godswood does not) and a
  `PageHeader` icon slot (pebblestone uses one in 37 of 49 call sites, godswood
  in none — that is pebblestone falling in line, not the package being
  deficient).

  Additive only: no existing export changes. `utils.ts` keeps `cn`, the shared
  types and `titleCase`; the new module is a sibling subpath because value
  formatting and class merging are different concerns reached at different call
  sites. 65 tests in `src/test/format.test.ts`, starting from godswood's corpus
  (the only one of the two with tests) and extended with pebblestone's cases;
  green under `TZ=UTC` and `TZ=America/Chicago`, which is the point of pinning
  the zone.

## [2026.8.15] - 2026-08-27

### Fixed

- **`DocumentTable`'s wrapper paints a surface instead of drawing an empty
  box.** It was `<div class="rounded-md border">`: an edge with nothing behind
  it. Driven at 1440x900 on a real page, the table and every ancestor for six
  levels computed `rgba(0, 0, 0, 0)` in BOTH themes, so the page's own
  background texture showed straight through a container sitting beside cards
  that computed `oklch(1 0 0)` — the exact inconsistency a consumer reported as
  "you can see straight through them". The wrapper now carries
  `bg-card border-border ds-edge overflow-hidden`, the same surface `Panel`,
  `StatCard`, `StatList`, `DetailPanel`, `EmptyState`, `ErrorState` and
  `DataTableTanstack` already use, and it is theme-aware because the token is:
  measured after the fix at `oklch(1 0 0)` light and `oklch(0.215 0.02 260)`
  dark.

  `border-border` is half the fix on its own. A bare `border` resolves to
  `currentColor` in Tailwind v4, so this hairline was being drawn in
  full-strength foreground — `oklch(0.24 0.016 85)` light, `oklch(0.93 0.01 240)`
  dark — where every other bordered surface in the package draws the border
  token at `oklch(0.86 0.01 85)` / `oklch(0.3 0.02 260)`. `overflow-hidden`
  comes with the surface as it does on every sibling: a row's
  `hover:bg-muted/50` otherwise paints square corners over the radius, which was
  invisible only while there was no surface to paint over.

### Added

- **A gate for the defect class: `src/test/bordered-surface.test.ts`.** No
  other check in this repo can see a container that draws a border and paints
  nothing. It type-checks, it renders, all 387 unit tests pass,
  `theme-coverage.test.ts` is satisfied because the classes that ARE there
  compile to real rules, and a screenshot on a plain page looks correct — the
  defect only appears once the box sits on a surface it should have been
  painting itself.

  The rule is the one a person would state: a container that holds CONTENT and
  draws a border needs a surface; a control does not. So it is scoped by
  element — block-level content containers only — and never looks at a button,
  an input, a switch or a badge, whose background legitimately comes from a
  variant or a state. `tailwind-variants` bundles are followed, so `Alert`'s
  bordered base passes on the `bg-card` its variants supply. No baseline and no
  allow-list: the package sweeps clean, so a debt register would be machinery
  for zero debt, and an allow-list is what a future bare-bordered container
  would get quietly added to. What a green run does not prove is written out in
  full at the foot of the file.

## [2026.8.14] - 2026-08-26

### Fixed

- **The three library surfaces survive a 390px screen.** All of
  `LibraryBrowse`, `DocumentTable` (shared with `CollectionDetail`) and
  `DocumentDetail` were laid out for a desktop only, which the first consumer
  found the moment it drove them at phone width. Three separate faults, one
  class:

  - `LibraryBrowse`'s facet rail was `hidden md:block` with nothing to reveal
    it, so below `md` the whole of filtering was simply absent — no drawer, no
    disclosure, no way to reach a facet at all. A `Filters` button now
    discloses the rail below `md` and reports its state through
    `aria-expanded`; the rail is unchanged from `md` up, and the button does
    not render when there are no facets to disclose. It is the only state this
    component owns, and a disclosure is presentation rather than a filter, so
    the page still owns every selection.
  - `DocumentTable` rendered all four columns at every width, so a real
    catalogue took the table to 1,612px at 390px and every row scrolled
    sideways inside its own scroller. Tags now drop below `xl` and Collections
    below `lg` — the same breakpoints the raw-table idiom's `TH_HIDDEN_UNTIL_XL`
    already used — and the title cell takes `max-w-0` with a `truncate`d link
    carrying its full text as a `title`. The two go together: a bound with no
    truncate overflows UNDER the next cell, which then swallows the link's
    clicks, and truncate with no bound never shrinks at all.
  - `DocumentDetail`'s identity list had `truncate` on values that could never
    shrink: a grid or flex item defaults to `min-width: auto`, so a 64-character
    content hash and a filesystem path stretched the card to 1,124px inside a
    390px screen and pushed every VALUE off the side, leaving the labels alone
    on it. `min-w-0` on the grid and each of its cells, `shrink-0` on each
    label, and a `title` on each value so the truncated text stays readable.

## [2026.8.13] - 2026-08-22

### Fixed

- **`SearchResults`' `results` prop no longer collides with the legacy HTML
  `results` attribute.** svelte/elements declares `results?: number` on every
  element, and 2026.8.12's published prop type intersected with it into
  `number & LibrarySearchResult[]` — a type no caller can satisfy, so any
  consumer running svelte-check went red at the call site. The inherited key
  is now omitted from the spread attributes.

## [2026.8.12] - 2026-08-22

### Added

- **The four fixed-prop library components: `LibraryBrowse`, `CollectionDetail`,
  `DocumentDetail`, `SearchResults` (#30).** The other half of the shared
  library UI, beside `SchemaForm`'s schema-driven half. The split rule is
  settled: configuration is schema-driven because its shape changes; library
  data is fixed components because its shape is stable.

  All four render plain props the app maps its own API responses into
  (`LibraryDocument`, `LibraryFacet`, `LibraryCollection`,
  `LibraryDocumentDetail`, `LibrarySearchResult`, exported from
  `@poodle64/ui/library-browse` and re-exported beside each component). The
  package holds no HTTP client, no endpoint string, and no knowledge of any
  backend or consuming app; links are the app's own via `documentHref` /
  `collectionHref` / `resultHref`, the same reasoning that has `AppShell` take
  `currentPath` as a prop. That is what lets the backend be replaced without
  touching a consumer, and it is not negotiable for convenience.

  Three are generalised from the library app's Console views; `SearchResults`
  is designed, not extracted — a ranked retrieval answer with the matched
  passage highlighted in a tint of the consumer's own accent, a source chip,
  mapped state, and a mono tabular relevance figure. Everything composes from
  what already ships: `detail-panel`, `panel`, `stat-list`, `empty-state`,
  `error-state`, `loading-state`, `status-badge`, `badge`, `button`, `input`
  and the `table` primitives; the one internal addition is the shared
  catalogue table `LibraryBrowse` and `CollectionDetail` both render, so the
  two surfaces cannot drift apart.

  Verified the way `SchemaForm` is: jsdom suites for prop handling and the
  empty/loading/error states, and a driven-browser pass
  (`?surface=library`, `?surface=search-results`) that clicks browse →
  document → collection, measures the resolved type faces, proves the 375px
  catalogue table scrolls inside its own container rather than widening the
  shell, and turns `--ds-color-primary` to show the highlight follows the
  consumer's accent.

## [2026.8.11] - 2026-08-21

### Removed

- **BREAKING: `AppShell` no longer has a `sidebar` slot, and no app has a second
  navigation column.** The slot let an app render a section's own pages beside
  the rail instead of inside it, and the estate's answer was two apps using it
  and seven not — with one of those two disagreeing with ITSELF: its Travel
  section rendered a second left-hand column while its Securities section put
  the same kind of links in a top rail. Operator ruling, 21/08/2026, on seeing
  those two modules side by side: no app supports an additional sidebar; a
  section's own pages roll out beneath it in the rail.

  `NavItem.children` (2026.8.7) is the one way in. It already discloses in
  place, auto-opens the section you are inside, and folds into the single drawer
  on a phone — which is why it won over modules-on-a-top-bar in the first place.

  A column that is not `NavItem`-shaped at all — a document's table of contents,
  a corpus tree, a filter panel — belongs in the page, as a sibling of the
  article it serves. It wants that page's breakpoints, and no other route should
  pay rail width for it.

### Fixed

- **`toItems` names each destination once.** A section that discloses its own
  pages names its landing page twice by nature: the parent row goes there, and
  the section's first child row is that same page under its own name
  ("Property", then "Dashboard"). Both rows are wanted in the rail, which
  renders them in different keyed blocks — but flattened for the command palette
  they collide, and every consumer keys the flattened list by `href`, so Svelte
  throws `each_key_duplicate` and the throw takes the palette's whole content
  with it. Measured in a consumer: ⌘K opened an empty sheet on every module
  route, and the app had to hand-filter its own nav before passing it. First
  occurrence wins, so the surviving row carries the section's own name.

### Changed

- The harness's second-`AppNav` surface moved from the removed slot into the
  page body and is now `?pagenav=1` (was `?sidebar=1`); `additivity.mjs` and
  `drive.md` follow. The nav-ink rule it pins is unchanged — a nav on the page
  keeps the page's ink while the rail follows the chrome's.

## [2026.8.10] - 2026-08-20

### Fixed

- **`PageHeader`'s actions row no longer overflows a narrow viewport.** The row
  is a flex ITEM of the header, so it carried `min-width: auto` — a floor at its
  own min-content width. Its `flex-wrap` could not get below that floor, because
  wrapping shrinks a flex CONTAINER and never its item floor. Measured at 360px
  on a consumer's index: the row rendered 408px inside a 328px parent and pushed
  64px of sideways scroll into the shell's content region.

  `min-w-0` lets it shrink so the wrap actually engages. This affected every
  consumer rendering `PageHeader` with actions, and was invisible to each app's
  own review because the offending markup is the package's.

## [2026.8.9] - 2026-08-20

### Changed

- **`AppShell`'s `brandTitle` now stands down below `sm`, leaving the mark
  alone.** On a phone the rail is gone, so the brand lockup is what the top bar
  carries — beside the menu button, the search affordance, the theme toggle and
  the identity surface. With the wordmark among them, search truncated to a
  single word at 390px, and in one app to a single letter.

  Shipped as a default because three apps had each already discovered it and
  each had written its own full `brand` override to get it, with three
  near-identical comments explaining the same 390px measurement. Two of those
  overrides additionally re-implemented the shell's own mark chrome verbatim —
  the same `size-8 place-items-center rounded-md border` span the `brandMark`
  branch already renders — so the override bought nothing but the responsive
  behaviour the shell would not give them. An app overriding a slot to re-earn
  something good is the package failing to ship it.

  Consumers using `brandMark` + `brandTitle` get this for free. The `brand`
  snippet still takes full control for a genuine lockup, but it is no longer
  the way to obtain a responsive wordmark.

## [2026.8.8] - 2026-08-20

### Changed

- **BREAKING (visual): `AppShell` now paints the house texture and offers the
  rail collapse control by default.** `texture` defaults to `'grid'` (was
  `'none'`) and `collapsible` to `true` (was `false`). Both shipped opt-in so
  their arrival moved no consumer, and the estate's answer to opt-in was
  measured across the nine stamped apps: two rails could collapse and seven
  could not, and five apps wore the texture — three of them through a
  hand-rolled `*-dotgrid` class in their own `app.css`, under three names, two
  ink variables and two grid pitches, only one of which carried the
  `background-attachment: local` that stops the floor sliding under the
  scroller. An opt-in house style measures who remembered, not what the house
  looks like. The shell shape is not an app's to pick (operator ruling,
  31/07/2026), so it is now the shell that decides.
- `texture="none"` and `collapsible={false}` remain the complete opt-outs, and
  both are gated: `none` renders the region exactly as it was before the
  feature existed, and `collapsible={false}` withdraws both the control and its
  `[` shortcut. The additivity tests now measure `grid` against `none` rather
  than against an omitted prop, since omitting it is what paints.
- The shell's own test harness stopped defaulting `collapsible` to `false`. It
  had been passing its own value, so the package default was never driven and
  the flip broke no test — the harness now forwards `undefined`, as it already
  did for `measure` and `texture`.

## [2026.8.7] - 2026-08-10

### Added

- **`AppShell` gains `searchPlacement: 'leading' | 'trailing'`** (default
  `'leading'`). Search is a global affordance, and where it sits changes what
  it reads as. `'leading'` keeps its historical position just after the
  `context` slot — so a shell that never names the prop is byte-identical —
  and `'trailing'` moves the SAME button (same
  `data-testid="ds-shell-search"`, same keyboard and aria behaviour) into the
  right-hand group with the theme toggle and identity. It is the lever for the
  shell-inversion layout: once `context` carries a module name and a view
  switcher, a search sitting beside it read as though it belonged to the
  switcher rather than being a global control. In the trailing group the
  button sizes to its clamp instead of stretching the row.

### Changed

- **BREAKING (visual): `AppShell`'s collapse control moved from the rail foot
  to the rail head, onto the brand row.** The API is unchanged —
  `collapsible` and the bound `collapsed` behave exactly as before — but every
  consuming app that sets `collapsible` will see its chrome change, and that
  is intended, not a tweak. The full-width "Collapse" row at the bottom of the
  rail is gone; in its place is an icon-only toggle at the rail's own top edge,
  right of the wordmark (`PanelLeftClose` expanded, `PanelLeftOpen` collapsed).
  When the rail is collapsed the head has no room beside the mark, so the
  toggle stacks under it, centred. The reasoning: a control that acts on the
  rail belongs at the rail's top edge, where every comparable shell puts it
  (Notion, Linear, GitHub's newer nav); the foot spent a full nav-item's width
  and vertical weight on a rarely-used control, sitting directly above the
  identity surface and competing with it; and a full-width labelled row read
  like a navigation destination rather than a control acting on the rail. The
  accessible name ("Collapse sidebar" / "Expand sidebar") and a tooltip are
  kept, and `[` now toggles the rail (shown in the tooltip), guarded so it
  never fires while focus is on an editable field.

## [2026.8.6] - 2026-08-10

### Added

- **`data-table-tanstack` column meta gains `headClass` and `cellClass`**,
  additive on top of the existing `meta.class` (which keeps meaning "both
  cells", unchanged). Each new slot reaches its own cell only, and wins over
  `class` on a conflicting Tailwind utility — `cn()` (the package's existing
  clsx + tailwind-merge helper) does the merge, nothing hand-rolled.

  Fixes a real regression: the shared table conflated the `<th>` and `<td>`
  class into one string, so a truncating column had no way to put `max-w-0`
  on the body cell alone — that class is what lets the column absorb leftover
  width and ellipsis instead of pushing every other column out of the card.
  Putting it in `meta.class` (both cells) collapsed the heading over its
  neighbour instead. The local table this component replaced already had
  separate `headClass`/`cellClass`; every consumer with a truncating column
  had been repeating an arbitrary-variant workaround
  (`meta: { class: 'w-full [&:where(td)]:max-w-0' }`) since. Now:

  ```ts
  { accessorKey: 'filename', header: 'Document', meta: { class: 'w-full', cellClass: 'max-w-0' } }
  ```

  `columnDef.meta` is also properly typed for the first time, via a
  `declare module '@tanstack/table-core'` augmentation (TanStack's own
  extension point for `ColumnMeta`) — every consumer importing `ColumnDef`
  from this package now gets autocomplete and a type error on a typo, and the
  component itself drops the `meta as Record<string, unknown>` cast it used
  to need.

## [2026.8.5] - 2026-08-10

### Added

- **`TileGrid`, an auto-filling tile grid** (`@poodle64/ui/tile-grid`,
  `master-project#241`). It emits a single
  `repeat(auto-fill, minmax(min(<min>, 100%), 1fr))` track that fits as many
  whole tiles as the width allows and collapses to one column on a phone,
  replacing the fixed `sm:grid-cols-2` every index hand-rolled — a fixed column
  count cannot use width, it can only stretch, so giving the shell a wider
  `measure` made those indexes worse rather than better. `min` (default
  `16rem`) is the one sizing knob — a denser index passes a smaller one — `gap`
  defaults to `0.75rem`, and `tag` (`'div' | 'ul'`) keeps an index its list
  semantics when its tiles are links. Tiles stay the caller's business; this
  owns the track and nothing else.

  Promoted from cadmus, its one existing consumer, because `master-project#241`
  is about to adopt `AppShell`'s `measure` prop across nine apps and each would
  otherwise re-solve filling the widened content the same way — the
  second-consumer promotion `canonical-app-shape.md` calls for, arriving nine at
  once. `AppShell` and its `measure` default are untouched: adoption stays
  per-app and deliberate.

  The `min()` wrapper is load-bearing and silently regressible — a bare
  `minmax(16rem, 1fr)` track cannot shrink below its minimum, so at 360px the
  row overflows the viewport instead of falling to one column. It renders
  identically at every other width, so nothing catches its loss visually; the
  test asserts it as a string.

- **`?surface=palette`, the palette gallery** (design-system#25), replacing the
  master project's standalone `dev/shadcn-showcase/` app. It renders the
  component set across its states plus a token swatch grid, inside `AppShell`
  so the nav ink sits on the chrome's own tinted surface, under any palette
  from `@poodle64/design-tokens`'s catalogue. The palette is applied exactly as
  a consuming app applies it, an attribute on the root element and nothing
  else, which is the claim: a palette reaches every component without any
  component knowing.

- **A per-palette contrast gate in `harness/drive.mjs`**, so `pnpm run
test:browser` now covers all twenty catalogued palettes in both modes. Per
  palette it asserts that the palette actually reaches the page (measured as a
  move from a no-palette baseline, so a block that never won the cascade fails
  rather than passing on the package's own colours), that the five status
  colours are unchanged, and that body copy, muted copy on two surfaces, the
  accent as a fill, a real `Button`'s label on its own fill, and the active,
  resting and badge nav inks each clear 4.5:1 — composited over the real
  ancestor stack, which for the nav is three layers deep. That extends #11's
  claim from three hand-written fixtures to the whole catalogue. 638 checks in
  the suite, all passing; the tightest margin is 5.24:1.

  Driven red before being kept: restoring papyrus-gold's original near-white
  foreground fails both the fill check and the real-Button check at 2.19:1 and
  exits 1, against 2.20:1 from the token package's own arithmetic gate.

### Changed

- `harness/drive.mjs`'s canvas compositing probe and its transition-disabling
  stylesheet are hoisted to module scope, now that the palette gate is a second
  consumer of both. No behaviour change to the #11 section that had them.

## [2026.8.4] - 2026-08-04

### Added

- **`AppShell` now owns the content texture**, via `texture?: 'none' | 'grid'`. It defaults to `none`, so **every existing consumer is byte-identical** and adoption is per-app and deliberate.

  `grid` paints the house atmosphere on the shell's scrolling content region: a faint dot-grid floor plus one soft accent vignette in the top-right corner.

  It exists because two apps had built that same picture separately, under two names, in two `app.css` files — and because one of them shipped it as a helper class routes opt into, which reached **four routes out of about fifteen**. Whether a given page wore the house atmosphere therefore came down to which pages someone had happened to touch, and no amount of care at the call site fixes that: a texture an app has to _remember_ to apply is not a texture, it is a coin toss with a stylesheet. That the SHELL paints it is the whole feature; the picture is the smaller half.

  | Value  | What it paints                                          | Reach for it when                                                        |
  | ------ | ------------------------------------------------------- | ------------------------------------------------------------------------ |
  | `grid` | a dot-grid floor plus one accent vignette in the corner | the app wants the house "instrument-grade" surface rather than flat page |
  | `none` | nothing at all                                          | the default                                                              |
  - **One texture rather than a menu, deliberately.** Both apps wanted the same picture and differed only on values — how dark the dots are, how the vignette is tinted, how far apart the dots sit. Those are `--ds-shell-texture-grid-ink`, `--ds-shell-texture-vignette-ink`, `--ds-shell-texture-grid-pitch`, `--ds-shell-texture-vignette-height` and `--ds-shell-texture-vignette-at`, retuned in one declaration without waiting on a release. A plain wash instead of a grid is that same declaration with the grid ink set to `transparent`, which is why it is not a second name in the union.
  - **The inks derive from the app's own `--foreground` and `--primary`**, so the grid inverts between light and dark with no per-mode override and the vignette carries the app's brand rather than a colour this package picked. Both were driven in Chromium in both schemes.
  - **It is painted on the region that SCROLLS, not on the measured content box.** `measure` caps that box, so a texture painted there would stop at the measure and read as a stripe down the middle of the page rather than as the floor the page sits on. The two props are independent and are gated as such.
  - **It is a background, not a layer, and that is the design rather than an implementation detail.** Both apps first reached for an absolutely positioned `::before` inside the scroller, which is subtly wrong three ways at once: at `z-index: auto` a positioned box paints _above_ non-positioned content, so the atmosphere tints the page instead of sitting under it — invisible only because it is faint, which is exactly why it survived in two codebases; `z-index: -1` trades that for sinking behind an ancestor's background, since neither `<main>` nor `.ds-shell` opens a stacking context; and it must be excused from hit-testing by hand. A background layer cannot be hit-tested, always paints beneath every descendant, adds no box to the flex column and opens no stacking context. **Proved, not claimed:** an opaque card photographs byte-identically with the texture on and off (8891 bytes both), while the floor beside it in the same pass does not.
  - **It travels with the content.** A scroll container's background defaults to `background-attachment: scroll`, which pins it to the border box and leaves the dots hanging motionless while the page slides over them — the easy mistake, not an exotic one, and one **no other check in this repo can see**, because the DOM is identical either way. `local` makes it the floor the page sits on. Observed at two instants: a strip of bare floor photographed either side of a 15px scroll (half the grid pitch), with `scroll` forced back on as a control where the same two photographs must come back identical. Both hold.
  - **It does not print.** A 30px dot grid prints as banding and a vignette as a corner smudge. On paper the texture is suppressed and the content region goes white — checked by emulating print media and reading the resolved background, not by reading the stylesheet. This lives in the package rather than in each app's print rules; it is the same copy both apps had already written for themselves. `html`/`body` stay the app's to decide, and an app's own print rules are unlayered so they still win.
  - **The feature adds nothing to a consumer's `:root`.** All four knobs are read through `var()` fallbacks at the point of use rather than aliased at `:root`, for the reason recorded in design-system#8: a `:root` alias holding a `var()` reference resolves once, at `:root`, where a scoped override or a scoped `.dark` wrapper below it can never reach the result. Read live on the element that paints them, one declaration moves the picture at any scope — driven in the browser rather than asserted.
  - **The vignette's corner is a knob because a gradient position is physical.** There is no logical form of `at 85%`, so an RTL app that wants the glow at the reading-start corner would otherwise have had to redeclare the whole rule to reach it. Driven at `dir=rtl`, at a 24px root font size, and under `forced-colors: active`: the texture stays painted, the region stays scrollable, and nothing gains sideways scroll in any of the three.
  - **The class and the attribute are resolved once, together**, the same guard `measure` carries since 2026.8.3: Svelte omits an attribute whose value is `null` while a class token under the same test survives, so a `texture={null}` from a loosely-typed prop bag would otherwise emit a class with no rule behind it.
  - `ShellTexture` and `SHELL_TEXTURES` are exported for an app computing the value.

### Consumer impact

**None, for anybody, without a deliberate edit.** Checked against every household frontend's actual `<AppShell` call site: eleven call sites across ten apps (milton has two layouts). No app passes `texture`, no app has a prop or nav field of that name, and no call site needs a line changed.

The additive claim is measured rather than argued, and — new in this release — **reproducible on demand rather than recorded as prose**. The cross-build diff had been done by hand for `level`, for `children` and for `measure`, each written up as a paragraph nobody could re-derive; adversarial review correctly called that an unverifiable claim as shipped. It is now `harness/additivity.mjs`, committed:

```sh
node harness/additivity.mjs ui-v2026.8.3
# 15 surface/viewport pairs, 105 compared fields (including the screenshot hash)
# IDENTICAL on every field and every pixel — the change is additive.
```

It builds the package at any base ref in a throwaway git worktree, renders the five surfaces an existing consumer already has (`shell`, `shell&sidebar=1`, `overflow`, `nested`, `measure&measure=page`) at 2560px, 1440px and 360px, and diffs the whole `<main>` subtree's `outerHTML`, both attribute sets, `<main>`'s computed background shorthand and box properties, the content box's computed `max-width`/margins/padding, eight geometry numbers, and the rendered screenshot. It exits non-zero on any difference and names the field. Driven red against `ui-v2026.8.0` before being kept: 19 differences, correctly attributed to `nested` and `measure`, which is what a release two features back should look like. It is deliberately not in `pnpm test` — it installs and builds a second copy of the package, so it is minutes rather than seconds, and it is meaningful only on a change claiming to be additive.

Both halves are permanent gates rather than a one-off. `src/test/app-shell-texture.test.ts` holds the DOM half under jsdom, and was driven red twice before being kept — once by forcing the texture on unconditionally, once by moving the class onto the measured box — so it gates rather than describes. `harness/drive.mjs` holds the resolved-paint half in a real browser at 2560/1440/360px, including `texture="none"` passed explicitly landing where omitting it lands.

Verification is 27 new browser checks and 9 jsdom cases. jsdom deliberately asserts none of the painting: it returns an empty string for `background-image` whether the stylesheet was imported or not, resolves no `color-mix()`, computes no `background-attachment`, and has no scrolling to observe a texture travel with, so a unit test there would pass against a build whose stylesheet was never imported. The first run of the new browser checks failed five of them and every failure was in the harness rather than the package — an empty flex child shrinking to zero so the page never scrolled, and a drawer hit-tested mid-animation; both are recorded where they were fixed.

**On `mainClass`.** The pre-existing seam is untouched and still composes, still last in the merge so an app's own utility wins. Its docstring no longer advertises "a background texture class", because that is precisely the pattern this release replaces.

## [2026.8.3] - 2026-08-04

### Added

- **`AppShell` now owns the content measure**, via `measure?: 'prose' | 'page' | 'wide' | 'full'`. It defaults to `full`, so **every existing consumer is byte-identical** and adoption is per-app and deliberate.

  It exists because "content is always full-width" (2026.8.0) did not remove the width decision, it pushed it down into every page. Surveyed at 2560px, one consumer had six distinct caps across nine routes — each a hand-written `mx-auto max-w-*` at the top of a `+page.svelte`, none wrong on its own, no two agreeing — between them using 15% to 79% of the width available. A sweep of the estate found the same shape everywhere: **42 hand-rolled caps across 34 page files, spanning eight different `max-w-*` values** — `max-w-5xl` ×11, `max-w-3xl` ×9, `max-w-4xl` ×6, `max-w-2xl` ×6, `max-w-md` ×5, `max-w-7xl` ×2, `max-w-6xl` ×2, and a bespoke `max-w-reader` ×1. Counted mechanically and reproducibly: a `class` attribute combining `mx-auto` with any `max-w-*` utility, in a `+page.svelte`, across the ten apps that consume this package (cadmus 18, milton 18, tapestry 3, portcullis 1, godswood 1, earworm 1; the remaining four have none). Not every one is a page-root cap — a handful sit on an empty-state block or a diagram wrapper — but that is the point rather than a caveat: nobody can tell which are deliberate. That is not a shell shape, it is a guess per page. `measure` makes it one decision, taken once, in the layout.

  | Value   | Width    | For                                                                  |
  | ------- | -------- | -------------------------------------------------------------------- |
  | `prose` | `72ch`   | long-form running text: documentation, an article, a policy, a guide |
  | `page`  | `80rem`  | an everyday page: a form, a detail view, settings, a wizard          |
  | `wide`  | `120rem` | an index or a dashboard: card grids, tables, charts, board columns   |
  | `full`  | no cap   | a canvas that should use the whole panel. The default                |
  - **The 80rem tier is `page`, not `default` as briefed.** A value literally named `default` that you do NOT get by default is a trap a reader falls into exactly once, and the prop's default is `full` — the additivity guarantee depends on it. It is also not `standard`, a name this package already retired in 2026.7.11 for saying nothing.
  - **Why `prose` is a tier rather than the narrow end of `page`**, measured rather than asserted: at 2560px uncapped, the same paragraph runs to **311 characters per line**, against an accepted band of 45–90 for continuous text. `prose` puts it at 80. A shared measure that let running text span a 4K panel would be worse than the hand-written caps it replaces, and worse everywhere at once. It is stated in `ch` rather than `rem` deliberately — a reading measure is a count of characters, so it tracks whatever face and size the app actually set; `page` and `wide` are page frames, so they are lengths.
  - **The tiers are CSS custom properties** (`--ds-shell-measure-prose|page|wide`, alongside `--ds-shell-rail-width`), so an app retunes one in a single declaration without waiting on a release.
  - **A cap is a ceiling, never a floor.** Driven at 1440px, `page` and `wide` measure identically to `full` (1192px): a measure never narrows a window that was already narrower than the tier.
  - **The cap is the border box**, so `padded` spends its inline padding inside the measure — the same arithmetic as the `mx-auto max-w-4xl px-6` idiom it replaces. This keeps the content box ONE element; a second wrapper to put padding outside the cap would break additivity and every consumer selector reaching `[data-slot="app-shell-content"] > *`. `padded` is otherwise untouched.
  - The cap is applied by `.ds-shell-measure[data-measure]` in `styles.css`, not by an arbitrary `max-w-[var(…)]` utility on the component: an arbitrary utility only exists if the consumer's own Tailwind build happened to scan the file spelling it, whereas the stylesheet is imported by every consumer as a condition of using the package. At `full` the class and the attribute are both absent rather than set to a no-op.
  - **The class and the attribute are resolved once, together.** Two independently-worded guards read as symmetric and were not: Svelte omits an attribute whose value is `null` while a class token under the same test survives, so `measure={null}` — which the type forbids, but a loosely-typed prop bag, a spread config or a nullable route field still delivers — emitted `ds-shell-measure` with no `data-measure` and therefore no rule behind it. Visually harmless, but it is exactly the DOM contract the additivity gate states. Found by adversarial review, which proved it by rendering the compiled expression through `svelte/server`; both now read one derived value, and a jsdom case pins it.
  - `ShellMeasure` and `SHELL_MEASURES` are exported for an app computing the value.

### Consumer impact

**None, for anybody, without a deliberate edit.** Checked against every household frontend's actual `<AppShell` call site at release: eleven call sites across ten apps (milton has two layouts; bragi and thoth consume primitives but mount no shell). No app passes `measure`, no app has a prop or nav field of that name, and no call site needs a line changed.

The additive claim was measured rather than argued, the same way 2026.8.1's was. `dist` and the harness were built at the pre-change commit and the `shell`, `overflow` and `nested` surfaces captured at 2560px, 1440px and 360px; the capture was then repeated on this build. Compared per surface/viewport pair: the whole `<main>` subtree's `outerHTML`, the content box's class string, its complete attribute set, its measured width, its offset inside `<main>`, and its computed `max-width`, `margin-left`, `margin-right` and padding. **All nine pairs identical on all ten fields** — the same markup and the same numbers, not merely no visible difference.

Both halves of that are now permanent gates rather than a one-off: `src/test/app-shell-measure.test.ts` holds the DOM half under jsdom (and was driven red by forcing the class on unconditionally, so it is a gate rather than a claim), and `harness/drive.mjs` holds the pixel half in a real browser at 2560/1440/360px, including `measure="full"` passed explicitly landing where omitting it lands.

The character band is font-robust rather than tuned to this machine, which matters because CI resolves a different fallback face than a developer's Mac. It was driven across eight faces at 2560px: the box moves 92px (668.16px on Avenir Next, 640.69px on the Linux-ish stack, 576px on Times New Roman) while characters per line move five (80, 80, 75). The cap and the glyph advance scale together, which is the property that earns `ch` for this tier. `readGeometry` awaits `document.fonts.ready` before measuring and reports the resolved family beside the count — a no-op today, since the harness ships no `@font-face`, and there so that self-hosting a face later surfaces as a readable number rather than a flake.

Verification is 25 new browser checks and 7 jsdom cases. jsdom deliberately asserts none of the widths: it resolves `max-width` to the unresolved `var()` literal, resolves `ch` against a font it never loaded, and reports every rect as zero, so a unit test there would pass against a build whose stylesheet was never imported. The widths are measured in Chromium — `72ch` proved against a probe sized in the same unit in the box's own face (668.16px both), 80rem and 120rem against the root font size the document actually resolved, centring proved from equal left/right gaps, and no tier introducing sideways scroll at 360px.

**On the 31/07/2026 ruling.** 2026.8.0 removed `variant` and `content` under a recorded operator ruling that apps "do not choose variants, content modes, or spacing". The one-composition half of that stands and is untouched. The content-width half is deliberately revisited here on the measurements above, and `measure` is not the old `content` prop returning: `content` defaulted to a cap and offered an app a look, whereas `measure` defaults to no cap, names its tiers for the kind of page rather than for a size, and exists to take the width decision away from pages rather than to hand a choice to apps. The component docstring and README no longer claim content is always full-width.

## [2026.8.2] - 2026-08-04

### Fixed

- **A nested child that IS the current page no longer leaves its parent claiming to be the current page too.** In the commonest nesting shape there is — a parent at `/education` with a child at `/education/two` — the parent's own prefix match fired as well, so both rows carried `data-active`, both rendered a `.ds-nav-indicator` edge bar, and both carried `aria-current="page"`. Two elements with `aria-current="page"` is an ARIA defect on its own, and visually the rail could no longer say where you were. Shipped in 2026.8.1; **any consumer adopting `children` should take 2026.8.2 instead**. Consumers with no `children` were never affected — `hasActiveNavChild` is false for a childless item, so the flat rendering is byte-identical either way, and the additivity gate holds.

  `within` is now computed first and suppresses `active`. What the parent keeps is exactly the section-root behaviour prefix matching was added for: on its own page, or on a page beneath it that no child row claims, it is still the active row.

  Found by adversarial review rather than by the suite, and both gates that should have caught it had been written to and missed — recorded here because the miss is the more useful half. The jsdom test only exercised children living at their own top-level routes, where the parent's prefix never matched and the bug could not fire; the browser check counted `aria-current` inside the disclosure panel, so it was structurally incapable of seeing the parent link outside it. Both are fixed and both were driven red against the 2026.8.1 build before being kept: three jsdom cases (a child that is the page, a page beneath the parent that no child claims, and the parent's own page), and a browser check counting `aria-current`, `data-active` and indicators across the whole nav.

### Changed

- Keyboard activation of the disclosure control is now driven in a real browser (Enter and Space, both asserted), along with Escape returning focus to the control from inside an open group. jsdom implements no activation behaviour for a `<button>`, so the unit test there had been dressing a synthesised click as a keyboard test; it now asserts only what that environment can actually prove — that the control is a real, focusable `<button>`.

## [2026.8.1] - 2026-08-04

### Added

- **A nav item can disclose its own children in place**, via `children?: readonly NavChildItem[]` on `NavItem`. An app whose sections have their own navigation had nowhere to put it inside the rail, so the observed workaround was modules in `nav` and the current section's pages in the `sidebar` snippet — two left-hand columns on a desktop. The alternative shape (modules along the top bar, rail for the current module) was rejected on mobile: it leaves two navigation surfaces that both need collapsing and both want the same hamburger, where one nested tree collapses to one drawer. Fully additive; an item with no `children` renders and behaves exactly as it did.
  - **The parent stays a destination.** Its label navigates as it always did; a separate chevron button carries `aria-expanded`/`aria-controls`. Folding both into the link cannot be made honest — `aria-expanded` on something that navigates away announces a state the user never observes — and making the label expand-only would silently change what `href` means the day an app added children to an item that already had one, which is the break this release claims not to have.
  - **Expansion follows the path, until a toggle overrides it.** A group holding the current page is open on first paint with nothing clicked, derived rather than stored, so it is also correct after a palette jump, a back button, and on the server. A deliberate toggle overrides that default for the life of the shell (in a SvelteKit layout, the session): an untouched group still opens as you walk into it, while a group you made a decision about keeps your decision. Nothing is written to storage — a shared package writing to a fixed key would collide with the app's own, and with itself on a page rendering two navs.
  - **One level, enforced by the type.** `NavChildItem` is `NavItem` minus `children`, so a second nesting is a `svelte-check` error where the nav is authored rather than a runtime complaint after the tree is written. The rail is 15.5rem and each level costs an indent; by depth three the label has less room than the chevron beside it.
  - **A collapsed rail renders no tree and no disclosure control** — 3.5rem of icons cannot hold one, and the alternative (a hover flyout) is a second interaction surface with its own positioning, touch and focus story. The children are absent from the document rather than `sr-only`, which would be the dead affordance this package treats as worse than a missing one; the parent stays an icon-only link to its own page, and the way back is the Collapse control the user just used.
  - **Escape closes the group focus is inside** and returns focus to the chevron, and is swallowed only when it actually closed something — so Escape elsewhere still reaches the shell and shuts the mobile drawer.
  - `toItems` now flattens children too, each parent followed by its own, so a nested page is reachable from `CommandPalette`. A nav with no children flattens exactly as before. `navChildren` and `hasActiveNavChild` are exported alongside it.
  - A parent whose section holds the current page but whose own `href` does not match carries `data-within="true"`, lifting its ink only. The tint, the weight and the edge bar stay reserved for the row that IS the page, so two rows never both claim to be current. This only fires where a section's children live at their own top-level routes. **The claim that "two rows never both claim to be current" was false as shipped in this release, and the reasoning that follows it is the mistake:** the ordinary nested-path case was NOT covered — prefix matching lit the parent alongside its own active child. Corrected in 2026.8.2.

### Fixed

- **The mobile drawer no longer inherits the rail's collapsed state.** The rail and the drawer are one element carrying one `collapsed` state, so a user who collapsed the rail on a desktop and later opened the menu on a phone was handed a 3.5rem icon-only drawer with no way out — the Collapse control is `md:flex` and does not render at that width. Pre-existing, and independent of nesting; found while building it, and worth fixing on its own terms since with `children` the phone would additionally have lost the sub-navigation entirely. `mobileNavOpen` implies narrow (the shell's own `matchMedia` effect earns that invariant), so a legitimate desktop collapse is unaffected.

### Consumer impact

Checked against every household frontend's actual `<AppShell` call site at release: eleven call sites across ten apps (milton has two layouts). No consumer needs a line changed. Three pass `collapsible` and so can reach the drawer bug fixed above; the trigger is a viewport crossing below `md` while the rail is collapsed (a narrowed window, a tablet rotating to portrait, a split view), not a phone as such — a phone browser is a separate browser and never sees a desktop's collapse.

| App (layout)         | `@poodle64/ui` spec | What it passes as `nav`                                                                                  | Fix at bump | What changes on screen                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cadmus (protected)   | `^2026.8.0`         | `NavItem[]` derived from `workbenchSections`, plus a `sidebar` snippet per section                       | none        | nothing yet. This release is what lets cadmus move per-section navigation out of `sidebar` and onto `children`, in its own repo — but only partly; see the limit below                                                                                                                                             |
| godswood (protected) | `^2026.7.7`         | `primaryNav()` modules, with `moduleNav()` groups appended on mobile, plus a `ModuleColumn` in `sidebar` | none        | the drawer is full-width, not icon-only, once narrow with the rail collapsed. Persists its collapse to `localStorage`, so that state survives a reload on the same browser. Same latent consolidation as cadmus: its mobile branch concatenates module groups onto the nav precisely because nesting did not exist |
| portcullis (app)     | `^2026.7.7`         | `NavGroup[]`                                                                                             | none        | as godswood — also persists its collapse to `localStorage`                                                                                                                                                                                                                                                         |
| milton (admin)       | `^2026.7.7`         | flat `adminNavItems`                                                                                     | none        | same fix, but narrower reach: its collapse is per-mount `$state` with no persistence, so only an in-session resize below `md` could ever have hit the defect                                                                                                                                                       |
| milton (protected)   | `^2026.7.7`         | `navFor(isAdmin)`                                                                                        | none        | nothing                                                                                                                                                                                                                                                                                                            |
| eight                | `^2026.7.8`         | flat `navItems`                                                                                          | none        | nothing                                                                                                                                                                                                                                                                                                            |
| earworm              | `2026.7.8` (pinned) | flat `navigation`                                                                                        | none        | nothing                                                                                                                                                                                                                                                                                                            |
| seshat               | `^2026.7.7`         | flat `navItems`                                                                                          | none        | nothing                                                                                                                                                                                                                                                                                                            |
| fixxxer              | `2026.7.8` (pinned) | a single-entry `navItems`                                                                                | none        | nothing                                                                                                                                                                                                                                                                                                            |
| tapestry             | `^2026.7.7`         | `NavGroup[]` typed against tapestry's OWN local `NavItem`/`NavGroup` interfaces, not this package's      | none        | nothing. Its local types are structurally assignable and unaffected by a field added here                                                                                                                                                                                                                          |
| mission-command      | `^2026.7.10`        | `NAV_GROUPS`                                                                                             | none        | nothing                                                                                                                                                                                                                                                                                                            |

The additive claim was also measured rather than argued: the nav component was rendered with a childless nav on the pre-change build and on this one, and the two DOMs are identical apart from Svelte's own invisible block-marker comments — same elements, same classes, same attributes, in the same order, expanded and collapsed. A gate in `app-nav-nested.test.ts` now holds the half of that a test can hold permanently.

No consumer uses `children` as a key on a nav item or in any nav-shaped interface, and every `items` key in every consumer's nav config decorates a genuine group wrapper rather than a leaf, so neither the new field nor `isNavGroup`'s `'items' in entry` narrowing changes how any existing nav is read. Two nuances found in the same sweep, neither a break: `milton`'s `MiltonNavItem extends NavItem`, so `children` flows through to it automatically; `tapestry` declares its own `NavItem`/`NavGroup` and never imports this package's, so it is immune to this release and will stay unable to nest until it migrates.

**What one level does not cover.** The brief for this change described a section as "a real page with fifteen topics beneath it", which is one level. Cadmus's actual Education column is deeper than that: a flat link block, then topic GROUPS under sub-headings, then a collapsible topic, then the modules inside it. Only the topic level lifts into the rail; the sub-headings and the module list do not, and `children` is a flat list with no heading of its own. That is a deliberate limit rather than an oversight — a third level leaves roughly 128px for a label in a 15.5rem rail, about fifteen characters — but it means absorbing such a column is a real information-architecture change in the consuming app (the deepest level moves onto the section's own page), not a lift-and-shift. `sidebar` remains the right home for a column that is not `NavItem`-shaped at all: cadmus's Marketplace, Strategy and ID26 columns render document trees and tables of contents, and nesting does not obsolete them.

`earworm` and `fixxxer` are hard-pinned rather than caret-ranged, so they will not see this release until they choose to.

## [2026.8.0] - 2026-08-01

### Removed

- **BREAKING: `AppShell`'s `variant` (`'rail' | 'header'`) and `content` (`'full' | 'wide' | 'standard' | 'prose'`) props are removed.** Operator ruling, 31/07/2026: every household app renders one shell shape, a permanent side rail/drawer carrying primary navigation plus a real top navbar (search, leading/actions, theme, identity), content always full-width. A consumer passing either prop gets a `svelte-check` type error on bump; delete the prop, nothing else changes. This supersedes the `content="standard"`→`"prose"` alias work landed in 2026.7.11 — that whole content-ceiling mechanism is gone.
- **Identity placement**: `identity` now renders exactly once, at the end of the top navbar's trailing slot (previously the `variant="header"` position). The brief for this change also listed "identity foot" as part of the rail behaviour being kept — taken literally that would render the same consumer-supplied `identity` snippet in two chrome regions at once, which conflicts with this component's own established, tested principle of never rendering a consumer slot twice (duplicated `id`s, test hooks, and interactive controls). Resolved by keeping `identity` in the top bar only and dropping it from the rail foot entirely. An app that relied on `variant="rail"` rendering identity in the rail foot will see it move to the top bar on bump.
- The top navbar now always renders with its full border/background/chrome — previously a near-empty "ghost strip" under `variant="rail"` on desktop, since it carried no identity and no visible nav. This is a visual change for every current `variant="rail"` consumer even though no prop of theirs needs editing.
- The two `styles.css` classes the composition change orphaned are deleted: `.ds-shell-panel` (the old header-variant mobile disclosure panel, with its `ds-panel-in` keyframes and its reduced-motion and chrome-ink selector entries) and `.ds-nav-horizontal` (the top-bar nav row's underline indicator and gap override). No component has rendered either class since the props were removed; the comment and README prose describing the horizontal underline and the disclosure panel are corrected with them. Nothing sanctioned styles against these classes, so no consumer loses behaviour it was entitled to.

### Consumer impact

Checked against every household frontend's actual `<AppShell` call site at release: ten call sites across nine apps (milton has two layouts). "Fix at bump" is the whole code change; everything else is behaviour the shell now provides without being asked.

| App (layout)         | Passes today                             | Fix at bump       | What changes on screen                                                                              |
| -------------------- | ---------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| earworm              | `variant="header"`, `content="wide"`     | delete both props | nav moves into the new permanent rail; the 120rem content cap is gone (full-width)                  |
| eight                | `variant="rail"`, `content="full"`       | delete both props | top navbar gains its full chrome (was the ghost strip); content already full-width                  |
| fixxxer              | `variant="header"`, `content="standard"` | delete both props | gains the rail; the 80rem cap is gone (full-width)                                                  |
| mission-command      | `variant="rail"`, `content="standard"`   | delete both props | navbar gains full chrome; the 80rem cap is gone; `identity` moves from the rail foot to the top bar |
| seshat               | `variant="header"`, `content="standard"` | delete both props | gains the rail; the 80rem cap is gone (full-width)                                                  |
| godswood (protected) | neither prop                             | none              | navbar gains full chrome; `identity` moves from the rail foot to the top bar                        |
| milton (admin)       | neither prop                             | none              | navbar gains full chrome; `identity` moves from the rail foot to the top bar                        |
| milton (protected)   | `variant="header"`                       | delete the prop   | gains the rail; `identity` already in the top bar                                                   |
| portcullis (app)     | neither prop                             | none              | navbar gains full chrome; `identity` moves from the rail foot to the top bar                        |
| tapestry             | `variant="rail"`                         | delete the prop   | navbar gains full chrome; `identity` moves from the rail foot to the top bar                        |

## [2026.7.11] - 2026-07-31

### Changed

- **`AppShell`'s `content="standard"` is renamed `content="prose"`.** Operator ruling, 31/07/2026: `"standard"` read as though it were the default, but it was always the 80rem-capped, reading-weight mode; `"prose"` says what it actually is. `"standard"` is kept as a deprecated alias mapping to the identical `mx-auto w-full max-w-[80rem]` class, purely so an existing caller's rendering does not change until it opts into the new name. The **default stays `content="full"`** (`w-full`, no max-width cap): it always has been, since the shell's very first commit (`c43cc60`) — this was never a fluid-vs-capped default flip, only the capped mode's name catching up to what it is. `"wide"` (120rem) is unchanged.

  Consumer impact, checked against every household frontend that renders `AppShell`: every one is unaffected by this release. `earworm` (`content="wide"`) and `eight` (`content="full"`) pass an explicit value untouched by the rename. `fixxxer`, `mission-command` and `seshat` pass `content="standard"`, which keeps rendering the identical 80rem cap via the alias. `godswood`, `milton` (both layouts), `portcullis` and `tapestry` pass no `content` prop at all and have always rendered full-width, unchanged by this release. `mission-command`'s own capped rendering, the one that prompted the ruling, is its own explicit choice and stays exactly as it is until `mission-command` itself chooses to switch to `content="full"` or drop the prop; that is a change for `mission-command`'s repo, not this package.

### Docs

- **`README.md` records `variant="header"` (top navbar) as the household standard** for `AppShell`, with `variant="rail"` a recorded per-app exception. The component's own default stays `"rail"` (unchanged): flipping every app's nav orientation on a patch bump would violate least-surprise for everything already relying on the current default. The standard is enforced by rule and by each app's own explicit prop, not by the component default.

## [2026.7.10] - 2026-07-31

### Added

- **Four new console-dashboard primitives, promoted from mission-command**: `arc-gauge`, `bar-row`, `scorecard` and `sparkline` (design-system#15, master-project#230 Finding 5). mission-command was the only household app still hand-rolling dashboard chrome instead of consuming this package; these four had no equivalent here, so its local copies were untested and unreachable by an upstream fix. Each is generalised only as far as mission-command's real call sites already needed, not speculatively:
  - `arc-gauge` — a radial capacity/percentage ring. Its `tone` prop is a named 3-member subset of the shared `Status` vocabulary (`Extract<Status, 'success' | 'warning' | 'error'>`), using the same names the rest of the package uses rather than the source's abbreviated `ok`/`warn`/`err` — info/neutral stay out because nothing calls them today. `size` now also sets the SVG's `width`/`height` attributes explicitly (previously relied on ambient sizing), making the source's own stated intent — the size IS the ring's physical footprint — literal rather than incidental. The embedded percentage/unit-label glyphs stay at the source's literal 10 and 5.4 SVG user-unit sizes: they are graphic annotations scaled by the viewBox, not CSS/DOM running text, so the household's ~0.75rem type floor does not apply to them — documented at the point of use so a future edit does not "fix" them into a floor violation of the ring's own established geometry.
  - `bar-row` — a labelled horizontal bar with a trailing tabular value, for a ranked list (a token-burn chart, a per-lane usage table) where a full `stat-card`/`stat-list` row would be too heavy. `color` stays a free CSS colour string rather than the shared `Status` vocabulary, since real usage already passes arbitrary per-row/per-series hues. Restyled from the source's scoped `<style>` block onto Tailwind utilities plus this package's existing `.ds-tabular` value-column utility, matching every other composed component's convention; the two raw font-size literals (0.86rem/0.84rem) both land on `text-sm`, the nearest step on the shared scale.
  - `scorecard` — a compact 0/1/2 dot-row health strip, for several independent checks read at a glance where `stat-card`'s single figure or `status-badge`'s single pill cannot represent more than one state at once. Reuses this package's own `.ds-dot`/`.ds-dot-{status}` classes instead of a second colour scale, and adds a computed `role="img"`/`aria-label` summary (e.g. `"off, on, warn"`) so the row is readable without colour (WCAG 1.4.1) — free, since it derives from the existing `scores` prop alone.
  - `sparkline` — an inline multi-series area+line trend, for a row or card with room for a trend but not a full Tier-1 chart. Ported as-is (already generalised: multi-series, caller-supplied colour per series); its internal grid-line derivation moves from a `$derived` holding a closure invoked in the template to `$derived.by`, which is the idiomatic Svelte 5 form for a multi-statement derivation and avoids recomputing an inert wrapper function every render.

  All four follow the package's composed-component conventions: kebab-case directory, `<name>.svelte` + `index.ts` exporting default and named, tokens/Tailwind only (no raw colour literals), and — where the root is a real element a consumer might need to address — the `WithElementRef<HTMLAttributes<...>>` + bindable `ref` + rest-prop-spread pattern from design-system#14. `arc-gauge` and `sparkline`'s SVG roots use the same shape without `WithElementRef` itself, since its `U extends HTMLElement` constraint cannot express an `SVGSVGElement`.

- **`StatusBadge` gains a `'primary'` status value**, additive to its own `status` prop only (`Status | 'primary'`) — the shared `Status` type itself is unchanged and stays closed at five states, so `StatCard`, `StatList` and `DataTableToolbar` are unaffected and never see it. mission-command's local `StatusBadge` carried a sixth tone, `pri`, confirmed live (a backend-sourced `RepublicItem.tone`) rather than dead code, for brand-emphasis chips — a genuinely different semantic axis (brand emphasis, not a health state) from the other five. Backed by two new rules in `styles.css`, `.ds-chip-primary`/`.ds-dot-primary`, keyed off `--ds-color-primary` next to the existing five-state block, whose doc comment now states plainly that `primary` is a `StatusBadge`-only extension.

## [2026.7.9] - 2026-07-31

### Added

- **`DetailPanel` takes `titleFace?: 'mono' | 'display'`** (defaults to `'mono'`, unchanged), so a consuming app whose titles are names rather than machine values — a hostname, a key — is not forced into the monospace face (design-system#9). No prop, slot or token previously reached it; the only route was a per-app CSS override of a package internal, or a fork. A closed choice on the component, the same shape as `AppDialog`'s `size` or `AppShell`'s `content`, so the face stays a design-system decision rather than a free-form class escape hatch. Additive: omitting it is unchanged from today.
- **A nav item can now claim additional path prefixes beyond its own `href`**, via `matchPrefixes?: string[]` on `NavItem` (design-system#10). Flat navigation — every section's children under the section's own path — already worked; this covers a section whose children live at their own top-level route (a "browse" list whose detail pages sit at a short URL rather than nested under the list), where the rail previously went dark on a page reached from its own nav item. Each prefix matches exactly like `href` does (prefix, with the same path-segment boundary as the existing `+ '/'` check), and independently of `href` being forced to exact at `/` — a root item can still claim a second, unrelated section. Additive: an item with no `matchPrefixes` is unaffected.
- **`PageHeader`, `StatCard`, `StatList`, `Panel`, `DetailPanel`, `ContextColumn`, `EmptyState`, `ErrorState` and `LoadingState` now spread rest props onto their root element** (design-system#14) — `class`, `id`, `aria-*`, `data-*`, and anything else an adopting app needs to identify or style an element, exactly as the primitives (`Card`, `Button`, `Table.Root`, …) already do. `class` merges with the component's own layout classes (`cn()`) rather than replacing them; every other attribute passes straight through. Each also carries a bindable `ref` to the root element, matching the primitives' idiom. Fully additive: a caller passing nothing sees no change.
- **`ContextColumn` takes `ariaLabel`.** Its `<aside>` had no accessible name, so it was exposed as a bare "complementary" landmark with no way for an app to distinguish it from any other. Additive; omitting it is unchanged from today.
- **`AppShell` takes `navLabel`** (defaults to `"Primary"`, matching today's behaviour), forwarded to every place the primary nav landmark renders: the rail/drawer `AppNav`, the header variant's inline horizontal nav, and the header variant's mobile disclosure panel's `AppNav`. Previously `AppNav`'s own `label` prop existed but `AppShell` never forwarded it, so an app replacing its own labelled landmark with the shared shell silently lost the name.

### Changed

- The resting nav label's AA contrast check in `harness/drive.mjs` flips from recorded to asserted (design-system#13, fixed upstream in `@poodle64/design-tokens`'s `muted-foreground` token): now 5.03–5.08:1 in light mode, 6.53–6.58:1 in dark, against the shell chrome surface — was 3.62:1 in light mode before the token moved.

### Fixed

- Scoped theming (design-system#8). `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`, `bg-secondary` and `border-input` now re-resolve against a scoped `--ds-color-*` override or a scoped `.dark` wrapper, not just at the page root. Previously each utility read a bare shadcn name (`--card`, `--popover`, …) declared once at `:root`; that name froze at its root-level value and never re-evaluated for a subtree override or a scoped `.dark` class below it. Each theme registration is now a fallback chain — `--color-card: var(--card, var(--ds-color-surface-2))` — so the bare name, if an app sets it, still wins (unchanged, additive); if it is unset (the default, and every app today), the utility resolves the live `--ds-color-*` token instead of a frozen alias.
- `.ds-skip-link` and `Sonner`'s CSS-variable bridge (`--normal-bg`/`--normal-text`) read `--popover`/`--popover-foreground` through the same fallback, for the same reason — they consume those names directly, outside the Tailwind theme mapping.

### Changed

- `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--accent`, `--accent-foreground` and `--input` no longer carry a default declaration in `:root`; they are pure by-name override hooks now, consumed only via the fallback chains above. An app that never set these is unaffected (the fallback supplies the same default value as before); an app that already overrides one by name is unaffected (still wins). See `@poodle64/design-tokens`'s own changelog for the companion, **breaking** change to `--color-*`-by-name override on the keys that package registers (`--color-background`, `--color-primary`, etc.) — this package's own bare-name levers (`--card` etc.) are unaffected by that.

## [2026.7.8] - 2026-07-29

### Fixed

- **`AppShell` painted the active nav label in `--ds-color-primary`, so an app whose brand hue is light shipped an unreadable nav entry** (#11). Measured in Chromium from resolved computed colours, composited over the surfaces the label actually sits on: a warm amber brand read **1.90:1**, a saturated blue **2.87:1**, against a 4.5:1 floor. The package default cleared it by 0.05. The nav's count badge was worse still, at **1.73:1** under the amber palette and **3.72:1** on the package default, because it sits on the active row's tint as well as its own.

  The framing matters more than the numbers. `--ds-color-primary` is the one token this package invites every app to override, and the only constraint stated where an app picks it is that it clear AA against its own `-foreground` pair: the **fill** case, primary as a background with text on top. Both failing palettes cleared that comfortably (7.69:1 and 5.00:1) and were illegible anyway. Consuming the token as **ink** on the chrome was a second, stricter requirement that nothing documented and that constrains a brand hue far more tightly than the stated rule implies. Every app picking a light or high-lightness hue inherited it silently.

  So the shell stops asking a colour it does not control to be legible text. The active row's ink is now the chrome's own foreground, whose legibility the app's palette is **already** obliged to guarantee, so the fix inherits an existing contract instead of inventing a new one. No app is told to repaint its brand. Light mode now measures **12.60–13.97:1** across all three fixture palettes and both variants; dark mode, which never failed, moves from 6.05–8.21:1 to 12.45–13.13:1.

  The brand is not lost, it moves to where it is not text: the 12% tint, the rail's edge bar, the header's underline. Those keep `--primary` at full strength deliberately. WCAG 1.4.11 holds a state indicator to 3:1 only where the state is not conveyed another way, and here it is conveyed three others (the ink lifts from muted to full, the weight steps to 500, the row carries `aria-current="page"`), so the bar stays the one place an app's brand hue survives undiluted. The gate asserts that redundancy rather than trusting the argument.

  An app whose primary genuinely is legible as ink on its chrome puts it back with `--ds-nav-ink-active`, and owns the contrast knowingly. `DESIGN.md.template` now states the fill-vs-ink distinction where an app picks its hue, which was the other half of what the report asked for.

  Two alternatives were measured and lost. Deriving an accessible ink by clamping lightness in `oklch(from …)` is not sound across the gamut: a saturated green clamped to L 0.55 still lands at 3.44:1, so it trades a visible failure for a subtler one. Mixing primary into the chrome ink **is** provable (35% clears 4.5:1 for every in-gamut primary in both modes) but at that ratio the hue reads as warm or cool grey, degrading every palette that was already fine to buy safety for palettes no app has.

- **An app inverting its chrome got no effect on the nav at all.** Found by the new gate, not by the report. `--ds-shell-chrome-foreground` is the documented way to invert the rail and bar against the palette; the nav rows ignored it entirely. A custom property declared **on** an element beats one inherited **into** it, and `.ds-nav` is a descendant of every chrome surface, so the chrome re-pointing `--ds-nav-ink` was overridden by `.ds-nav`'s own declaration on the very element that consumes it. Both declarations were correct in isolation and only their placement was wrong, which is why no compiled-CSS gate could see it: the winner is a cascade fact and needs an engine. It was invisible in use too, because both sides default to the same token, so the only symptom was an app asking for an inverted chrome and getting silence. The chrome now sets a variable the nav **reads** rather than one it redeclares.

  The gate pins both halves of that rule, because it has to give two opposite answers at once: `AppNav` is also exported for a route-scoped secondary column on the ordinary page background, and that one must NOT follow the chrome — an inverted chrome would otherwise paint near-white ink on a near-white surface. The harness renders one beside the inverted rail and asserts each stays where it belongs.

### Added

- **`aria-controls` on the mobile disclosure toggle** (#12). The toggle already managed `aria-expanded` correctly and moved focus into the panel, trapped it, and returned it on Escape; what was missing was the programmatic relationship between the control and the region, which is how assistive technology offers to jump to the region rather than relying on DOM order, and how automated tooling can tell the two elements are related at all. Both variants carry it: under `variant="rail"` the reference is live from first render, because the rail and the drawer are one element; under `variant="header"` the disclosure panel is created and destroyed with the state, so the reference is present while the panel is and omitted rather than left dangling when it is not. The region id is generated per instance, so two shells on one page cannot collide with each other or with an app's own ids.

- **A real-browser contrast gate for the whole defect class** (`harness/drive.mjs`). The class is _a shared component painting a colour the consumer owns as ink_, and nothing cheaper can see it: jsdom applies no stylesheet and returns the unresolved `var(--…)` literal, so a unit test passes just as happily on a colour nothing defines, and a compiled-CSS gate proves a rule exists without ever resolving `color-mix()` over a real surface. The gate drives the built package under three palettes (the package default plus two deliberately different consumer brands, including the low-luminance-on-light amber that is the failing shape) across both themes and both variants, and asserts the resolved ratio.

  Three measurement details are load-bearing, each having produced a wrong answer first. Contrast is taken against the **composited ancestor stack**, not the page background: the active row's background is a 12% `color-mix` over the chrome and the chrome is `bg-shell/80` over the page, so the label sits on three layers and any single one of them is the wrong comparison. **Transitions are disabled** before reading, because swapping a custom property starts `.ds-nav-item`'s 150ms colour transition and `getComputedStyle` mid-flight returns an interpolated value; the first run of this gate reported the package default while believing it had applied the override. And each fixture palette is asserted to clear AA **as a fill** first, so a future edit that breaks the fixture fails as a fixture problem rather than quietly weakening the claim.

  The gate also records two numbers it does not assert, each with its reason: the brand indicator's own ratio (non-text, and redundant per the assertion above), and the resting nav label's, which is a genuine AA failure at 3.62:1 in light mode but belongs to `--ds-color-muted-foreground` in the token package rather than to this shell, and is tracked as #13.

  `src/test/nav-ink.test.ts` is the cheap structural half that runs on every `pnpm test`: it cannot report a ratio, but it catches the one-character regression that puts `var(--primary)` back, in milliseconds and without a browser.

### Changed

- **The harness follows the OS colour-scheme preference instead of claiming a default mode.** `ModeWatcher` was passed `defaultMode="dark"`, which was measurably not doing what it said: mode-watcher tracks the system preference and Chromium's default is light, so every surface in the harness had in fact been rendering **light** since the day it was written. The contrast gate has to know which theme it is looking at, so the theme is now driven by `browser.newContext({ colorScheme })` and waited on rather than assumed.

## [2026.7.7] - 2026-07-29

### Fixed

- **An overlay with more rows than fit the window ran off the bottom of it, and could not be scrolled back.** Found in the first app to adopt `2026.7.6`, by opening a select with 36 options in a real browser; it reproduces on `2026.7.2` and is as old as the components. It affects the select, the dropdown menu and the popover — every app rendering any of the three over a list longer than the viewport.

  The mechanism is one missing declaration and it is invisible in the class list. The select's content carried `overflow-y-auto`, correctly spelled, doing nothing: `overflow` only produces a scroll when something constrains the height, and nothing did. So a 36-option popper laid out 1008px tall in an 800px window, its last option at y=1040, with `scrollHeight` and `clientHeight` both 1008 — not scrollable, not clipped, simply gone past the fold. bits-ui mounts `SelectScrollDownButton` only while scrolling is possible, so the one affordance that would have said "there is more" was absent too. A keyboard user could still press End and commit a value blind; a mouse user could not reach it at all.

  bits-ui publishes the space available as `--bits-select-content-available-height`, and the content now caps to it. The cap tracks the viewport rather than being a constant, which is asserted at two window heights so that stays true.

  The dropdown menu had the identical omission and takes the identical fix. The popover was the same defect in its other form — no cap **and** no `overflow-y-auto`, so tall content was not even a scroll container; it takes both, because capping alone would have traded unreachable content for clipped content.

  Command's list was checked and left alone: its `max-h-72` genuinely constrains it, it scrolls, and its last row is reachable. Tooltip carries no list. Dialogue and alert-dialogue are not on the floating layer and size themselves.

  Worth recording for whoever next diffs these against upstream: this is **not** a port that drifted. shadcn-svelte carried `max-h-(--bits-select-content-available-height)` at `1.0.0` and removed it in the rewrite that moved utilities into per-style `cn-*` classes — current `cn-select-content`, `cn-dropdown-menu-content` and `cn-popover-content` carry no height cap at all. The fix restores the `1.0.0` utility; matching current `main` would reintroduce the defect.

### Added

- **A browser gate for the whole class** (`harness/drive.mjs`, `?surface=long-lists`). Nothing cheaper could have caught this. jsdom has no layout, so `scrollHeight` and `clientHeight` are both `0` there and `scrollHeight > clientHeight` is false on a working build and a broken one alike — a unit test asserting the real behaviour would fail on the fix. A compiled-CSS gate can prove the rule exists but not that a box obeyed it. The gate opens each overlay over 36 rows at 800px and 560px, and for each one asserts the content ends inside the window, that the rows past the fold scroll rather than being clipped, and that driving that scroll brings the last row into view. It fails 20 checks on the previous build.

  It measures the element that genuinely scrolls, which for the select is not the one carrying the cap: bits-ui lays the content out as a flex column and gives the viewport `flex: 1; overflow: auto`, so the cap on the content is what gives the viewport a height, and the viewport is what moves. Read on the content, the fixed select reports 740 vs 740 and looks broken.

## [2026.7.6] - 2026-07-28

Five apps migrated onto this package. What they found is below; the package
absorbs it so no app has to fork around it.

### Fixed

- **Every overlay this package ships opened and closed with no transition** — dialogue, alert-dialogue, dropdown menu, popover, tooltip, select and command — in any app that had not, years earlier, copied a pair of declarations into its own `app.css`. Four of the five adopting apps were shipping that.

  Two independent dead layers, one underneath the other, and each is silent in exactly the way the `@custom-variant dark` defect fixed in `2026.7.3` was: the markup is identical whether the rule matches or not, so there is no build error, no lint hit, no failing test and no visual diff on a static screenshot.

  The first is the variant. This package writes ~47 `data-open:` / `data-closed:` utilities; Tailwind v4 compiles a bare `data-open:` to `&[data-open]`, and bits-ui emits `data-state="open"` — an attribute nothing in the tree carries. The two declarations now ship in `styles.css` beside the utilities that depend on them.

  The second only became visible once the first was fixed, by driving a dialogue open in a real browser and reading the resolved `animation-name`: still `none`. `animate-in`, `animate-out`, `fade-in-0`, `zoom-in-95` and `slide-in-from-*` are not Tailwind utilities — they come from `tw-animate-css`, which this package neither imported nor declared. It is now a dependency, imported from `styles.css`, on the same principle: the package writes the utility, so the package owns what makes the utility real. An app that also imports it itself loses nothing; the definitions are identical.

  Only `data-open` and `data-closed` needed declaring. The other five shorthand data-variants this package writes — `data-selected`, `data-highlighted`, `data-disabled`, `data-placeholder` (bits-ui writes all four as empty-string-or-undefined) and `data-inset` (this package's own menu items) — are bare attributes that Tailwind's default `&[data-x]` already matches, so a declaration would only restate it. That distinction is measured rather than assumed, and pinned; see the gate below.

- **The popover's zoom scaled from the wrong origin.** Its content carried the React registry's `transform-origin` custom property, inherited verbatim when the component was ported, and nothing in a Svelte tree ever sets it — bits-ui uses its own. An undefined custom property makes the declaration invalid at computed-value time, so the property silently fell back and the panel zoomed from its own centre instead of from its trigger. It also gained the `data-slot` marker every other content component in the package already had.

- **`--color-shell-foreground` was registered as a theme colour and read by nothing.** The shell painted its chrome text off `--foreground` and `--muted-foreground`, so an app pointing `--ds-shell-chrome-foreground` at a contrasting value got no effect at all, and the only route to chrome ink that inverts against the palette was to override a package style — the per-app divergence this package exists to end. A registered key with no consumer is worse than a missing one: a missing key fails loudly at the utility, a dead one looks like a supported option.

  The rail, the top bar, every chrome control and every navigation rule now read it, alongside a new `--ds-shell-chrome-muted-foreground` for the resting state. Both default to the tokens the chrome previously hard-coded, so no app's rendering moves until it asks. Navigation ink resolves through a pair of locals rather than the chrome key directly, because `AppNav` is also exported for a route-scoped secondary column on the ordinary page background: inverting the chrome must not drag that with it.

### Added

- **`avatar`** (`@poodle64/ui/avatar`) — root, image and load-state-aware fallback. `AppShell` defines the `identity` slot and building that surface needs an avatar, so every consumer was keeping a private copy of the upstream primitive purely to fill a slot the shell itself asks for; in one app it was the sole survivor of a hundred-file vendored folder, a file that could never receive an upstream fix. The group and badge variants are not included: no surveyed app had a consumer for either.

- **`AppDialog` takes `onOpenChange`**, so a caller can act on the dismissals it did not drive — Escape, the scrim, the close control, which is how 12 of one app's 28 dialogues close. `bind:open` reports the new value but offers no moment to act on it, so the workaround is an `$effect` that also fires on the open leg. The two compose: bind for state, take this for the side effect.

- **`AppDialog`'s width scale grows to five** (`xs` `sm` `md` `lg` `xl`). Three was one app's whole reason for keeping a local dialogue frame. The scale extends at its ends rather than being renumbered, so `sm`, `md` and `lg` mean exactly what they always did and no existing call site changes width.

- **`StatusBadge` takes `pulse` and `class`.** The status vocabulary is five settled states and deliberately closed, so it had no way to say "in progress": a sync that is running and one that has finished are both `info` and read identically. Motion is the axis that separates them without adding a sixth word, and it composes with all five because it carries no colour meaning. The animation stops under `prefers-reduced-motion: reduce`, so it never carries meaning alone — the label still says what is happening. `class` is for placement, which only the call site knows; colour and shape stay the package's.

- **`StatCard` takes `valueTone`.** A negative figure rendered in the default foreground with a coloured dot beside its label, which is the wrong element carrying the meaning — the eye goes to the figure, and the figure said nothing. `status` remains the health of the source and `valueTone` the sign of the number; a card often makes both claims at once (a healthy feed reporting a loss). Colour is a refinement, never the message: the figure still carries its own sign.

- **`PageHeader` takes a `breadcrumbs` snippet, and `title` is now optional.** One app could not adopt this component at all: 19 of its 22 page headers carry a trail and 15 have no title, because its page header IS a breadcrumb bar with actions opposite. It grew a slot rather than becoming a second component — a `BreadcrumbHeader` would have had to re-implement the actions row, the eyebrow, the info tip and the spacing, and every app would then face a choice between two page headers that must not drift, which is the drift this package exists to end. The trail itself stays the app's, as a snippet: a breadcrumb trail is made of routed links, and a package with no SvelteKit runtime cannot own those (the same reasoning that makes `AppShell` take `currentPath` as a prop). A title-less header emits no heading at all — an empty `<h1>` would be worse than not adopting.

- **`Table` takes `containerClass`.** The table and its scroll container are different boxes and only one of them can be told to be shorter; a sticky header needs a bounded, scrolling ancestor and `class` lands on the `<table>`. An app wanting one had to reach in from the outside with `[&>[data-slot=table-container]]:…`, an arbitrary-variant selector aimed at a structure this package is free to change — a private detail in use as public API. Naming the seam makes it public and keeps the structure ours.

- **A real-browser gate, wired into CI** (`harness/drive.mjs`, `pnpm run test:browser`). Three of the most expensive defects on this programme were invisible to every gate in this repo _and_ to jsdom, and each was found by a person happening to look. The script opens all four bits-ui overlay families and asserts the resolved `animation-name` is the enter animation rather than `none`, measures the shell's content region at 375px and 320px across four page-wrapper shapes, and drives the avatar through a genuine 404 and a genuine decode. It is a script rather than a model-driven session because the choreography is pre-known; it prints every observed value beside its verdict, passing or failing.

- **Four new compiled-CSS gates**, each driven red before being kept:
  - every shorthand `data-*:` variant the built package ships must appear in an exhaustive owned map (so a new one cannot arrive unowned), must compile to a selector targeting the attribute it is owned against, and that map is pinned against what bits-ui really puts in the DOM — otherwise it is only a table someone typed;
  - every animation utility the package writes must emit a rule in a consuming app that imports nothing extra;
  - every `--color-*` key this package registers must be read by a utility or a `var()` in the built output — the gate that would have caught `shell-foreground`;
  - nothing in the built package may reference a Radix custom property, which no Svelte tree sets.

  Plus per-component gates for each new prop: the dialogue's self-dismissal driven through a probe, the width scale compiled to five distinct container widths with none of them unprefixed, the untoned figure asserted inert, the title-less header asserted to emit no heading, the two table class seams asserted to land on different boxes, and the avatar's load-state machine driven rather than rendered.

### Changed

- **The `svelte` peerDependency floor moves from `^5.0.0` to `^5.33.0`** — bits-ui's own requirement, and the lowest version covered by the sweep below.

  A report reached this package that every bits-ui overlay was silently dead on Svelte `5.53.5` with bits-ui `2.18.1`, with a type check, a lint, 257 unit tests and a production build all green, and asked for `>=5.56.2` to be encoded as a floor. It was swept before being encoded: sixteen Svelte versions from `5.30.0` to `5.56.8`, each in an isolated project holding nothing but bits-ui, that Svelte, and the four overlay families, driven in a real browser. Every version opened every overlay; jsdom agreed; and a deliberately duplicated Svelte instance (bits-ui given its own nested copy, with Vite's dedupe both on and off) did not reproduce it either.

  So it is not encoded. A floor that locks consumers out of a range measured to work is a worse defect than the one it claims to prevent, and a version range can only ever express a break someone has already characterised. What replaced it is the scripted overlay gate above, which catches the class of defect whatever causes it. `harness/drive.md` records the full sweep.

- **`<main>` in `AppShell` carries `data-slot="app-shell-content"`**, and the shell's content container carries `min-w-0`.

  The second of those is honest bookkeeping rather than a fix, and the distinction is worth stating because it contradicts the obvious reading of the report. `min-w-0` there was measured **inert** in the current structure — the harness reports identical numbers with and without it, at both phone widths, under both wrapper shapes — because the automatic minimum size applies to a flex item's main axis and `<main>` is a column. It stays as the correct declaration for the box, not as the thing that fixes anything.

  What the shell genuinely owns is the **blindness**. `overflow-y: auto` makes `overflow-x` compute to `auto` too, so `<main>` — not the document — is where a wide child's excess lands, and `document.documentElement.scrollWidth` (the number nearly every app's overflow test reads) therefore cannot move. That is how an app carries real sideways scroll on a phone with its suite green throughout. The slot marker gives every consumer a stable element to measure instead, and the README documents the check. A child wider than the region still has to carry its own scroller — this package's `Table` does; a `<pre>` or an unbreakable string needs one from the page.

- **`CardTitle`'s `level` prop was already published**, in `2026.7.5`. The app that reported it missing was on `2026.7.3`; verified against the tarball on the registry. No change was needed, and the ARIA workaround it describes can be deleted on upgrade.

## [2026.7.5] - 2026-07-28

### Added

- **`CardTitle` can now be a real heading, via an optional `level` prop** (`1`–`6`). Given one it renders the matching `<h1>`–`<h6>`; omitted, it renders the `<div>` it always did.

  A card title is not always a heading, so the `<div>` default is right and stays — it matches upstream shadcn, and a card whose title merely labels a figure would put a phantom stop in the document outline. What was missing was any way for a consumer to say "this one IS the heading", and that gap is not free: it is invisible. The app this component's `<h3>` was replaced in has dozens of call sites where the card title is genuinely the heading for that card's content, on pages whose only other landmark is the page `<h1>`. After migrating onto this package those pages have an `h1` and then nothing — a screen-reader user navigating by heading gets one stop for an entire admin dashboard. No error, no lint hit, no visual difference; every app adopting this package inherits the same loss the same way, which is why the escape hatch belongs here rather than in each consumer's own fork of the component.

  `level` is a heading LEVEL and never a size. The class list, `data-slot` and every rest prop are identical in both modes — the component is one `<svelte:element>` rather than two branches, so there is nowhere for them to drift apart — and the identity is measured, not asserted: seven cards differing only in that prop render at the same 352×22 title box inside the same 384×114 card, with all eighteen probed computed properties equal. That matters because `<h1>`–`<h6>` carry UA font-size, weight and margin a `<div>` does not. The class list overrides size and weight itself; **margin is neutralised by Tailwind's preflight and by nothing in this package**, so that dependency is now pinned against the compiled consumer chain rather than left to be rediscovered by an app that drops preflight.

  Sizing stays where it already was, on `class`. Existing consumers are untouched: the default is unchanged, measured against a rebuild of the previous component in the same engine (identical class list, attribute set, box and computed style). The one difference in the whole read is the position of Svelte's empty anchor comment inside the element — invisible to layout, to the cascade and to the accessibility tree, all three measured. `harness/drive.md` records it, along with why the two-branch alternative was built, measured and rejected.

- **A gate for both halves of that claim** (`src/test/card-title.*`). The heading branch and the div default are asserted against _each other_ rather than against a copied-out class string, so the pin cannot rot the next time the class list is edited. Five red drives, each isolating one assertion: ignoring `level` fails only the six level tests; dropping `font-medium` from the heading branch fails only the parity test; dropping its rest props fails only the rest-props test; defaulting `level` to `3` fails only the "renders a div" test; and compiling the consumer chain without preflight fails only the UA-metrics test — which is what shows that last one is guarding a real dependency rather than restating the class list.

  The real-browser leg is `harness/drive.md` (`?surface=card`), because jsdom can make neither claim: it applies no stylesheet, so a `<div>` and an `<h3>` are trivially identical there whether or not anything neutralises the UA metrics, and its `getByRole` is a static element→role table rather than a tree a browser built. In a real engine the six heading cards expose `heading "Estate summary" [level=1…6]` and the div card exposes plain text with no heading node anywhere on the page.

  Deliberately left alone, having been assessed: `DialogTitle` is bits-ui's and already carries the dialogue's `aria-labelledby` semantics, so a heading there would add an outline entry to a surface that is already named. `PageHeader` is documented as the one page-title pattern and its `<h1>` is the point. `Panel`, `DetailPanel`, `EmptyState` and `AlertTitle` are a different defect class from this one — they hard-code a level (`h2`, `h2`, `h3`, `h5`) rather than omitting the element, so they contribute to the outline already and the open question is whether their fixed level suits every nesting an app puts them in. That is worth its own pass; changing them here would move existing consumers' outlines for symmetry rather than for evidence.

## [2026.7.4] - 2026-07-28

### Fixed

- **`ErrorState` announced nothing at all.** It is rendered when an async load fails, so it arrives _after_ the page has settled — and it carried no live region, so a screen-reader user was told nothing: the page silently changed and the failure was invisible. Every app adopting this package inherited that, and it was found by the fourth adopter, whose own local `ErrorState` had `role="alert"` from the start and lost it on migrating here.

  This was an inconsistency inside the package rather than a decision. The sibling `LoadingState` has had `role="status"` + `aria-live="polite"` since the initial release; `ErrorState` was extracted without the equivalent. It now carries `role="alert"` + `aria-live="assertive"`, and the pairing is deliberately not the sibling's: loading is not urgent and waits its turn, whereas this surface only exists because the user's task has already broken, so it interrupts. `EmptyState` is deliberately left alone — an empty result is ordinary static content the app placed, and announcing a blank list as loudly as a broken one is the over-correction, now pinned by its own assertion.

  Attributes only. The class list, the prop contract and the markup are untouched, and the null visual result was measured against a pre-change build in a real engine rather than assumed: identical bounding box, background, border, radius, padding and text metrics, with `role`/`aria-live` the only difference in the whole read.

### Added

- **A live-region gate for the async-outcome surfaces** (`src/test/live-regions.*`). It reaches each state by _driving_ a load rather than by mounting the finished markup, because the claim is not that an attribute is present — it is that the region exists at the instant the outcome lands, which is the only instant a screen reader has to announce it. Driven red first: with the attributes removed the failure surfaces as a bare paragraph and four assertions fail; with `role="alert"` restored but `aria-live` dropped, three still fail, which is what keeps the explicit pairing from silently decaying into the implicit one.

- **The real-browser harness now covers those surfaces too** (`?surface=states`), because jsdom cannot make this claim either: `getByRole` there is testing-library resolving a static element→role table, so it proves the string and nothing about what the platform is handed. A real engine exposes the failure as an `alert` node carrying the message, and exposed the pre-change build as a bare paragraph. `harness/drive.md` records both.

## [2026.7.3] - 2026-07-28

### Added

- **The application shell (`app-shell`), and `command-palette` alongside it.** Primitives and page chrome are not what makes an app feel like an app; the shell is. Every household frontend still hand-built its own, and five were surveyed before this API was settled: a rail-plus-drawer, an eleven-file collapsible sidebar tree under its own top bar, and three header-only bars that each answered the mobile question differently. They agreed on almost nothing structurally while trying to be the same thing.

  Two variants cover all five, because the only structural disagreement that survived scrutiny is **where primary navigation lives**: `variant="rail"` gives a permanent left column with an overlay drawer below `md`, `variant="header"` a horizontal row in the top bar with a disclosure panel. Everything the apps otherwise differed on turned out to be a slot rather than a variant, so the brand, the identity surface, a context switcher, a banner and a secondary column are snippets. The package therefore imports no app store, no app route and no app brand, which is exactly the coupling that made the best existing shell unliftable: its navigation was a module-level import, not a prop, and it reached directly into two app stores and two hardcoded routes.

  `NavItem` and `NavGroup` are exported so apps type their own config against them. They carry no notion of who may see an item: two surveyed apps gate navigation on admin or per-module permission and both do it with their own auth store, so apps filter before they pass. `currentPath` is a prop rather than a `$app/state` import for a related reason — this package has no SvelteKit runtime, so importing it would make SvelteKit a hard peer and make the shell untestable outside a running app.

  Sensible defaults were a design constraint: `nav` plus a brand gets a working shell, with a bypass link (WCAG 2.4.1), a theme toggle, a mobile treatment and an active-state marker that is never colour alone. `CommandPalette` ships beside it because it had the identical coupling to a hardcoded navigation module, and leaving it behind would have stranded the shell's search affordance; one nav config now feeds both, and the palette owns its own ⌘K binding instead of each app re-typing the handler.

- Focus management and modal semantics for the shell's mobile overlay: focus moves in on open and returns to the trigger on close, Tab wraps rather than walking out into the covered page, the overlay carries `role="dialog"`/`aria-modal` only while it _is_ the overlay, and crossing up past `md` closes it so "open" genuinely implies "narrow". The scrim, the close button and the trigger each carry a distinct accessible name; the trigger uses the ordinary disclosure pattern (a stable name plus `aria-expanded`).

- **A real-browser verification harness (`harness/`).** jsdom applies no stylesheet and returns the unresolved `var(…)` literal from `getComputedStyle`, so it passes on a colour nothing defines: the blind spot behind five defects in this programme. The harness compiles the real Tailwind consumer chain over the built package and is driven at desktop and phone viewports; `harness/drive.md` records every claim, the observed value, and three measurement traps that produced false failures. The stateful behaviour is driven separately in jsdom, where it belongs.

- **A named regression guard for the `checkbox` barrel export**, ported from the reference frontend the primitive was extracted from as that app migrates onto this package — the coverage belongs where the component now lives, not re-forked in the consumer. It pins the defect fixed in 2026.7.0 (bits-ui's compound namespace exported under the name `Checkbox`, shadowing the styled wrapper) by mounting the _named_ export and asserting the wrapper's own `data-slot="checkbox"` marker, then driving the control off → on → off. Both assertions were driven red first: the historical barrel fails at mount, and a mountable-but-wrong export (`CheckboxPrimitive.Root`) fails only the marker check while toggling perfectly — which is precisely why asserting the marker is not redundant with driving the control.

## [2026.7.2] - 2026-07-28

### Fixed

- **The shadcn colour surface generated no CSS in a consuming app (#3).** Every component here is written against the shadcn semantic names, but nothing ever registered them as Tailwind theme colours. A consuming app declared `--card` in a plain `:root`, which makes the variable exist and tells Tailwind nothing, so `bg-card` compiled to no rule at all. Eleven aliases were dead across ~126 references: `card`, `popover`, `muted`, `accent`, `secondary`, `input` and their `-foreground` pairs. In practice that meant dropdown menus with no hover state, inputs and textareas with no border of their own, and cards and popovers with no surface colour. Note the asymmetry that made it easy to miss: `muted-foreground` was registered while `muted` was not, so `text-muted-foreground` worked and `bg-muted` silently did not.

  `@poodle64/ui/styles.css` now ships the mapping and the registration together, beside the components that depend on them. The values are not a fresh design: every app in the estate that had an alias layer had already converged on the same surface ladder (`card`/`accent` on `surface-2`, `popover` on `surface-3`, `muted`/`secondary` on `surface-1`, `input` on `border`), so they are hoisted verbatim. There was no disagreement to arbitrate. A consuming app now needs no alias layer of its own, which is the per-app divergence this package exists to delete; an app that keeps one can drop it at leisure, since adopting this release is a single added import either way. Sidebar and chart colours are deliberately excluded: no component here references them, and they are the one part of the surface apps genuinely differ on.

- **The width scale resolved to padding-sized values (#4).** `max-w-sm` capped an element at 8px rather than 24rem, wrapping text one word per line. This was fixed upstream in `@poodle64/design-tokens` 2026.7.2, which is published; the reports came from apps still resolving 2026.7.1. Nothing in this package reintroduces it, and it is now guarded here as well as there.

- The Toaster read `var(--color-popover)` from an inline style attribute. Tailwind v4 tree-shakes theme variables that no generated utility uses, so that key was never emitted and the toast surface fell back to nothing. It now reads the bare shadcn variable, which is declared unconditionally and cannot be shaken away.

### Added

- **A gate that fails loudly when a component references a colour utility with no matching theme registration.** This is worth more than the mapping work: a dead utility passed every gate in this repo and survived a full app migration unnoticed, because the markup is identical whether the rule exists or not. The check compiles the real built package with the real Tailwind compiler, wired exactly as a consuming app wires it, and names the missing registration. It carries no allow-list; where a candidate emits nothing, it recompiles with that colour name registered and reports only the ones that come alive, which is what separates a dead utility from a string that was never a class.

- **A namespace guard covering this package's own stylesheet.** The collision behind #4 has been independently rediscovered three times across the estate and hand-patched locally each time. `@poodle64/design-tokens` guards its own `@theme` block, but this package now ships one too, so a scale key added here would shadow Tailwind's container scale identically while that guard stayed green. This one compiles the whole shipped import chain and asserts every sizing utility means exactly what plain Tailwind means.

- **A one-owner-per-key check, and an import-order check.** `@theme` registration is decided by import order, so a colour key both this package and `@poodle64/design-tokens` registered would resolve differently depending on which stylesheet an app imported last: the same override working in one app and silently doing nothing in another. This package now registers only the keys the token package does not, and the gate asserts both that the two sets stay disjoint and that every shadcn utility resolves to the same colour with the stylesheets imported in either order.

  All three gates assert on compiled output and resolved values rather than on class names, and each was driven red against its own defect before being kept. A class-name assertion is precisely the check that passes today while the component renders unstyled, and jsdom cannot stand in either: it does not resolve `var()` in computed styles, so a jsdom assertion passes on a completely unregistered colour.

### Changed

- `@poodle64/ui/styles.css` is now **required**, not an optional extra for the composed components: it carries the theme registration every component depends on. The README states the contract.

## [2026.7.1] - 2026-07-28

### Added

- **16 composed page-chrome components**, each its own subpath export alongside the primitives: `page-header`, `panel`, `detail-panel`, `context-column`, `app-dialog`, `dialog-section`, `stat-card`, `stat-list`, `status`, `status-badge`, `empty-state`, `error-state`, `loading-state`, `info-tip`, `data-table-toolbar`, `data-table-tanstack`. Primitives are not what makes an app look like an app; the page chrome is, and every app was hand-building it. Extracted from the household reference frontend as they actually run there, not designed from a spec: the table is the TanStack-shaped pair (the page owns the `Table` instance, the component owns how it looks and how a row is picked), not a `rows`/`columns` config API.
- `@poodle64/ui/styles.css` — the component stylesheet these components require, imported once in the consuming app's `app.css`. Carries the `text-display` / `text-body` / `text-stat` / `tracking-eyebrow` scale keys, the `.ds-edge` card treatment, the `.ds-dialog-section` divider rule, and the `.ds-chip` / `.ds-dot` status classes. Every value resolves through a `--ds-*` token or a shadcn semantic variable, so the consuming app's alias layer still owns the palette; the sole literal is a neutral shadow, overridable via `--ds-shadow-sm`.
- `TH_CLASS` / `TD_CLASS` / `TH_HIDDEN_UNTIL_XL` on the existing `table` export, for a small static table that does not earn a full TanStack instance.
- Behaviour-driving tests for the new set (34 total): the table's sorting, global search, chip filters, empty branch, master-detail select (mouse and keyboard), bulk selection, indeterminate header state, the imperative `getSelectedIds()` accessor and filter-eviction; the dialogue's open and close; the context column's detail flowing in and out; the empty/error action snippets; the loading state's live region; and the negative branch where a `DetailPanel` status carrying no label draws no chip at all.

### Fixed

- `DataTableTanstack` select-all could never deselect. `toggleAll()` read the `allSelected` derived _after_ clearing the set it derives from, so it always re-evaluated to false and the branch re-selected every row. Inherited from the source app; found by driving the control rather than rendering it.
- `DataTableTanstack` row checkboxes never registered a selection. The checkbox's wrapper handled the click to stop it reaching the master-detail row _and_ toggled the selection, while the checkbox's own `onCheckedChange` toggled it again, netting out to nothing. The wrapper now only stops propagation.
- A code comment in `switch` named the private app the primitives came from. This repo is public; the sizing rationale is kept, the identifier removed.

## [2026.7.0] - 2026-07-23

### Added

- Initial release: 25 shadcn-svelte primitives (bits-ui) — 21 extracted verbatim from the estate's reference frontend (`alert-dialog`, `badge`, `button`, `card`, `checkbox`, `command`, `data-table`, `dialog`, `dropdown-menu`, `input`, `input-group`, `label`, `password-input`, `select`, `separator`, `skeleton`, `sonner`, `switch`, `table`, `textarea`, `tooltip`), plus `alert`/`popover`/`progress`/`tabs` from the first app that migrated onto this package and needed them — plus the shared `cn()` helper and TS utility types.
- Built with `@sveltejs/package`; per-component subpath exports (`@poodle64/ui/<name>`), matching shadcn-svelte's own convention (a flat barrel would collide on shared names like `Root`/`Content`/`Trigger`).
- Publish workflow: tag `ui-v*` → GitHub Packages (`@poodle64/ui`).

### Fixed

- `checkbox/index.ts` exported the raw `bits-ui` `Checkbox` primitive namespace under the name `Checkbox`, shadowing the actual shadcn wrapper component (exported as `default`) — a latent bug inherited verbatim from the source app, which never itself imports `{ Checkbox }` from its own copy. Surfaced by the first real second consumer, trying `<Checkbox bind:checked={...} />`. Fixed to export the wrapper component.
- `checkbox.svelte`'s props type didn't strip bits-ui's `children`/`child` snippet props before merging in its own `{#snippet children(...)}`, causing a type conflict for any consumer binding `checked` — the same `WithoutChildrenOrChild` wrapper the other snippet-based primitives (`dropdown-menu-checkbox-item`, `dropdown-menu-radio-item`, `select-item`) already used.
- `bits-ui`, `mode-watcher`, and `svelte-sonner` moved from `dependencies` to `peerDependencies` (kept as `devDependencies` for this package's own build/typecheck) — each is a singleton the consuming app must share with this package, not something safe to bundle a second copy of.

WP-51 Lane WP (`master-project#174`): supersedes the vendor-per-app pattern for the frontend component-system factory surface — see `docs/development/wp51-canonical-shape.md` in `poodle64/master-project`.
