# Grafana — Top Rail Research

Subject: Grafana's `AppChrome` shell — the v10/v11/v12-era ("Grafana UI") top nav and
mega menu, current `main` branch as of 2026-09-04. This is a build well past the classic
pre-v10 look (persistent dark icon rail, no breadcrumbs) that the brief explicitly
excludes.

**Evidence base**: source read directly from `grafana/grafana@main` on GitHub (component
paths cited per-section), Grafana's own design-system docs
(`grafana.com/developers/saga/patterns/navigation/`, `grafana/design-system` via
DeepWiki), the `grafana/grafana` GitHub issue/PR history for the navigation epics, and
five live screenshots against the public demo instance (`play.grafana.org`) in
`reference/`, all opened and verified genuine: `grafana-breadcrumbs-dashboard-data.png`
(a real dashboard, chrome fully visible — the single richest image), `grafana-nav-
collapsed.png` (mega menu fully closed), `grafana-nav-overlay-open.png` (mega menu open
as a floating overlay, not docked), `grafana-breadcrumbs-folder.png` (a folder-listing
page, second breadcrumb depth), and `grafana-theme-drawer-dashboard-wide.png` (a
2546px-wide capture, though the theme-change modal it shows obscures most of the page
body — kept for the sliver of live top-bar/breadcrumb it exposes, not for content-width
evidence). All five are on the current post-129580 UI generation (see Q3).

---

## 1. What lives in the top bar itself

Confirmed live in `grafana-breadcrumbs-dashboard-data.png` (real dashboard,
`play.grafana.org`) and in source (`public/app/core/components/AppChrome/TopBar/
SingleTopBar.tsx`). Left to right, in the **breadcrumb row** (header level 1):

- **Docked mega-menu rail** to the left of everything — see Q3, this is NOT part of the
  top bar's own flex row when docked
- **Nav toggle (hamburger)** — only rendered when the mega menu is NOT docked-open
  (`{!menuDockedAndOpen && (...)}`); sits immediately right of the logo
- **Grafana logo** (`HomeLogo`) — same conditional, so logo+hamburger appear together
  or not at all in the top bar itself (when docked, both live in the rail's own head —
  Q3)
- **Scopes selector** (`ScopesSelector`) — Cloud/Enterprise scoping feature, conditional
  on `topLevelScopes`, not present in a plain OSS instance
- **Breadcrumb trail** (`Breadcrumbs` component) — see Q4
- Then, right-aligned in the same row: a search box styled as a fake text input
  (`TopSearchBarCommandPaletteTrigger` — see below), a "quick add" `+` button
  (`QuickAdd`), a help `?` icon (`HelpTopBarButton`), an extension-sidebar toggle
  (`ExtensionToolbarItem` — AI/Assistant icon in the screenshot), a "Sign in" link (when
  anonymous) or the profile avatar (`ProfileButton` — Q2)

**Org switcher is NOT in the top bar.** `OrganizationSwitcher` renders only inside the
mega menu's own header (`MegaMenuHeader.tsx`) — see Q3 — and even there it renders
nothing at all (`return children`) unless the signed-in user belongs to more than one
org, which most single-tenant OSS installs never trigger. This is confirmed in source
(`OrganizationSwitcher.tsx`): `if (orgs?.length <= 1) { return children; }`.

**Search is not a live-typing search box** — `TopSearchBarCommandPaletteTrigger.tsx`
renders a `PretendTextInput`: styled exactly like a text field (search icon, greyed
placeholder "Search...", a `Ctrl+K`/`⌘K` hint on the right) but it is structurally a
`<button>` — clicking it (or the shortcut) opens the `kbar` command palette overlay
rather than accepting keystrokes inline. Sizing is explicit: `minWidth: 140, maxWidth:
350, flexGrow: 1`.

A **second row** (header level 2, `showToolbarLevel`) appears on pages that carry page
actions or a time picker — visible live in `grafana-breadcrumbs-dashboard-data.png` on
a dashboard: time-range picker (`Last 30 minutes`, timezone, absolute-range popover),
`Refresh`/interval selector, share/export icon, a zoom-out icon, and an `Edit` button at
the far right. This is `SingleTopBarActions`, rendered by `AppChrome`'s
`headerLevels === 2` branch — carrying `scopes`, `actions` (page actions) and
`breadcrumbActions` together, on its own row, still inside the sticky chrome (see Q7).

## 2. Where user identity surfaces, and what clicking it reveals

Avatar-only, top-right of the breadcrumb row (`ProfileButton.tsx`): a 24×24px circular
`gravatarUrl` image inside a `ToolbarButton`, no name/text alongside it — `aria-label`
"Profile" is the only textual identity marker at rest. Anonymous sessions show "Sign in"
in its place instead (confirmed live).

Click → a dropdown menu (`TopNavBarMenu`, driven by the backend's `profile` nav node,
via `Dropdown`/`placement="bottom-end"`) containing:

- "Change theme" (opens a `ThemeSelectorDrawer` modal — this is the drawer captured in
  `reference/grafana-theme-drawer-dashboard-wide.png`, showing Dark/Light/System
  preference plus several "Experimental" community themes — Desert bloom, Gilded grove,
  Gloom, Sapphire dusk, Tron)
- "Enable kiosk mode"
- "Latest from the blog" (opens a `NewsContainer` drawer) — gated on
  `config.newsFeedEnabled`
- A plugin extension slot (`UserProfileMenu` extension point, e.g. a setup-guide entry)
- A divider, then "Sign out" — gated on `!config.auth.disableSignoutMenu`

The `profileNode` itself is driven by the backend nav tree (`state.navIndex['profile']`)
so its exact contents (e.g. "Profile settings", "Preferences" links) come from that tree
and were not exhaustively enumerated here — the menu shell and the items above are
confirmed from `ProfileButton.tsx` directly.

## 3. Where the nav-collapse toggle sits — and a very recent move

**State-dependent, by design**, and it moved again very recently:

- **Mega menu closed**: a hamburger icon sits at the very left of the top bar, before
  the breadcrumb — confirmed live in `grafana-nav-collapsed.png` and
  `grafana-breadcrumbs-folder.png` (`SingleTopBar.tsx`, `MEGA_MENU_TOGGLE_ID`).
- **Mega menu open as an overlay (not docked)**: clicking that hamburger opens the menu
  as a **floating panel over the page** — confirmed live in
  `grafana-nav-overlay-open.png`: the panel (Starred/Dashboards/Explore/Drilldown/AI/
  Alerts & IRM/Machine learning/Testing & synthetics/Observability/Administration) sits
  on top of the dimmed page content rather than pushing it aside, matching the design
  docs' own description of this state ("When open, the menu acts as an overlay"). A
  small dock/undock icon sits bottom-left of the overlay panel. (This particular capture
  also shows a `play.grafana.org`-only promotional banner — "Your Data Deserves Better
  Than a Spreadsheet" / "Create free account" — that is demo-instance chrome, not part
  of the product itself, and is not evidence of anything in this research.)
- **Mega menu docked open** (a permanent side rail): the hamburger disappears from the
  top bar entirely (`{!menuDockedAndOpen && (...)}` gates it out) and control moves to
  the **rail's own head** — confirmed live in `grafana-breadcrumbs-dashboard-data.png`
  (the docked rail shows the Grafana logo + a small bracket-style dock/undock icon at
  the very bottom-left of the rail, plus a close "×" at the top when the header renders
  — `MegaMenuHeader.tsx` / `MegaMenu.tsx`'s `DOCK_MENU_BUTTON_ID`, an `IconButton` with
  `web-section-alt` icon, visible only at the `xl` breakpoint and up).

**What changed, and when**: PR
[`grafana/grafana#129580`](https://github.com/grafana/grafana/pull/129580), "Nav: Move
hamburger and logo and make menu appear below top nav bar" (torkelo, merged 12 Aug
2026, milestone `13.2.x`) — its own description: _"Move hamburger to right of logo, so
we always have the hamburger in the same place no matter if menu is docked or not."_
Before this PR the hamburger's position was inconsistent between docked and undocked
states; the PR also moved the mega menu to render as a panel below the top nav bar
rather than however it previously overlaid it, and fixed the org switcher's position in
the non-docked state along the way. This landed **roughly three weeks before this
research was done** — current main-branch behaviour, not yet reflected in most
third-party screenshots or blog posts, which is why the live `play.grafana.org` capture
was the only way to confirm it visually.

This is the same _direction_ of change (top-bar toggle → rail-head toggle) independently
found in LiteLLM's current source (`litellm.md` Q3) — worth noting as a converging
pattern across both subjects, not just a Grafana idiosyncrasy.

**Earlier history** (textual evidence only, no screenshot): Grafana's original
breadcrumb+mega-menu shell shipped as an opt-in beta in **9.3 (Dec 2022)** behind a
`topnav` feature toggle
(`grafana.com/blog/grafana-9-3-feature-new-navigation-updates/`) — the blog post's own
framing: _"Updated layouts that feature breadcrumbs and a sidebar... A new header that
appears on all pages in Grafana that includes a dashboard search function."_ Before
9.3, Grafana had neither breadcrumbs nor this unified top bar at all — a persistent
icon-only left rail was the whole of the chrome. The brief for this research explicitly
excludes that pre-v10 era, so it is not otherwise documented here.

## 4. Breadcrumbs: in the top bar, and what that buys

Yes, unambiguously — Grafana's own design-system docs are explicit that this was the
headline change of the whole redesign: _"Grafana's topnav breadcrumbs are... the very
top most popular part of the 2022-2023 navigation redesign"_
(`grafana.com/developers/saga/patterns/navigation/`). Confirmed live: the breadcrumb row
in `grafana-breadcrumbs-dashboard-data.png` reads `Dashboards > Demo: Prometheus >
kube-state-metrics - Home` — a genuine multi-level hierarchical trail (not a
single-level label like LiteLLM's), built from `buildBreadcrumbs(sectionNav, pageNav,
homeNav)` in source.

Design-system guidance (same source) is explicit about what this buys and the
constraints it imposes:

- Breadcrumbs reflect information-architecture **hierarchy, not browser history** — a
  deliberate choice, backed by a separate "Return to previous" component
  (`ReturnToPrevious/`) that restores context when a link jumps across distant branches
  of the IA (e.g. a cloud app creating a dashboard) — because breadcrumbs and the
  browser back button are both unreliable for that job.
- Every breadcrumb-visible page must have a real landing page — "Do not redirect within
  the megamenu/breadcrumbs to compensate for a lack of a landing page."
- Sentence case, not title case; truncation risk is called out explicitly as a design
  constraint page-title authors must respect.

Interaction with the page title: Grafana runs BOTH — the breadcrumb trail lives
permanently in the sticky top bar, and a separate, chrome-owned `PageHeader` component
still renders a real `<h1>`-equivalent title in the page body for `Standard`/`Home`
layout pages (see Q5). The breadcrumb is wayfinding; the page header is the page's own
identity block. They are not collapsed into one thing.

## 5. Page-level header beneath the rail

There is a genuine, **shared/chrome-owned** page-header component — `PageHeader.tsx` —
used automatically by the `Page` shell for `PageLayoutType.Standard` and `.Home` layouts
(not `.Canvas` — dashboards render their own dashboard-specific header instead, with the
time picker etc. shown in the level-2 toolbar row described in Q1):

- Title: `<h1>{navItem.text}</h1>` (or an `EditableTitle` where inline rename is
  supported), optionally preceded by a `navItem.img` logo or an `AccentBoxBadge`-wrapped
  icon
- Optional `PageInfo` metadata row and `subTitle` beneath the title
- `actions` render on the right of the same flex header row (`justify-content` via
  `titleSubtitleContainer`/`.actions` split) — this is where page-level buttons sit for
  a Standard-layout page (e.g. Administration, Connections pages)

So the split is: **breadcrumb** (top bar, chrome-owned, hierarchy) → **page title +
actions** (`PageHeader`, chrome-owned but page-configured, in the scrollable body) →
**page content**. For dashboards specifically, actions instead surface in the sticky
level-2 toolbar row (Q1) rather than in a `PageHeader`, because dashboards use `Canvas`
layout and skip `PageHeader` entirely.

## 6. Content width

**No max-width cap on dashboards or ordinary pages; the ONE exception is the Home
page.** Confirmed directly in `public/app/core/components/Page/Page.tsx`:

- `PageLayoutType.Canvas` (dashboards): `canvasContent` — `flexBasis: '100%', flexGrow:
1`, padding only (`theme.spacing(2)`), **no `maxWidth`**.
- `PageLayoutType.Standard` (most admin/settings/list pages): `pageInner` — padding
  only (`spacing(2)` mobile, `spacing(4)` ≥`md`), **no `maxWidth`**.
- `PageLayoutType.Home` — the ONE deliberately capped case: `homeInner` sets `maxWidth:
${theme.breakpoints.values.xxl}px` (**1440px**, from `packages/grafana-data/src/
themes/breakpoints.ts`) and `margin: '0 auto'` — centred with dead space either side
  on a wide viewport, by explicit design (this is Grafana's own landing/welcome page,
  not a data-dense surface).

So at a 2560px viewport, a dashboard (`Canvas`) genuinely fills the available width
(minus the mega-menu rail's fixed `MENU_WIDTH: '320px'` when docked, and the extension
sidebar's own width when open — `getContentSizeStyles` even subtracts the extension
sidebar's width from `maxWidth: calc(100% - Npx)`). Whether Grafana's own dashboard
GRID responds to that width by stretching panels proportionally or by fitting more
columns depends on each dashboard's own panel-grid configuration (a 24-unit-wide grid
system, author-controlled per dashboard) rather than on any global page-shell rule —
that is a property of individual dashboards, not the chrome, and was not further
investigated here. The **shell itself imposes no ceiling**; only the Home page does.

**Screenshot corroboration is partial**: `grafana-breadcrumbs-dashboard-data.png`
(1280×720) shows dashboard panel cards running edge-to-edge inside the content padding,
consistent with the no-max-width finding, but at a standard, not a 2560px-class,
viewport. `grafana-theme-drawer-dashboard-wide.png` is genuinely wide (2546×1818) but
the theme-selector modal obscures the page body beneath it, so it does not itself prove
the wide-viewport claim — the claim rests on the `Page.tsx` source, not on a wide,
unobscured screenshot. This is flagged rather than overstated.

## 7. Sticky behaviour

The top nav (`AppChrome.tsx` → `.topNav`) is explicitly `position: 'fixed'`, `top: 0,
left: 0, right: 0` (shifted right by `MENU_WIDTH` when the mega menu is docked), at
`zIndex: theme.zIndex.navbarFixed`. **Both header rows are pinned** when both are
present — the breadcrumb row (level 1) and, on pages that have one, the actions/toolbar
row (level 2, `SingleTopBarActions`) sit inside the same fixed `topNav` element. The
scrollable content area compensates with `paddingTop: headerLevels * headerHeight` so
content starts below the fixed chrome rather than under it.

The docked mega menu itself is also `position: 'fixed'` (`dockedMegaMenu` style,
`height: 100%, top: 0`), so it too stays in place while page content scrolls
independently beneath/beside it.

---

## Sources

- `grafana/grafana` GitHub, `main` branch, read 2026-09-04:
  `public/app/core/components/AppChrome/AppChrome.tsx`,
  `AppChrome/TopBar/SingleTopBar.tsx`, `AppChrome/TopBar/ProfileButton.tsx`,
  `AppChrome/TopBar/HelpTopBarButton.tsx`,
  `AppChrome/TopBar/TopSearchBarCommandPaletteTrigger.tsx`,
  `AppChrome/MegaMenu/MegaMenu.tsx`, `AppChrome/MegaMenu/MegaMenuHeader.tsx`,
  `AppChrome/OrganizationSwitcher/OrganizationSwitcher.tsx`,
  `core/components/Breadcrumbs/Breadcrumbs.tsx`, `core/components/Page/Page.tsx`,
  `core/components/Page/PageHeader.tsx`,
  `packages/grafana-data/src/themes/breakpoints.ts`
- PR [`grafana/grafana#129580`](https://github.com/grafana/grafana/pull/129580) (nav
  toggle/logo move, merged 12 Aug 2026) and issue
  [`#89840`](https://github.com/grafana/grafana/issues/89840) ("Navigation: Unified
  AppChrome bar" epic, closed/done)
- `grafana.com/developers/saga/patterns/navigation/` — Grafana Labs Design System,
  Megamenu/Breadcrumbs/Return-to-previous pattern docs
- `grafana.com/blog/grafana-9-3-feature-new-navigation-updates/` (Dec 2022) — the
  origin of the breadcrumb+topnav redesign, for historical contrast
- DeepWiki `grafana/grafana` (11.2, Frontend Navigation UI) and `grafana/design-system`
  (3.3, Navigation Components) — corroboration of the AppChrome/MegaMenu architecture
- `reference/grafana-breadcrumbs-dashboard-data.png` — live `play.grafana.org` capture,
  real dashboard, full chrome visible, opened and verified
- `reference/grafana-nav-collapsed.png`, `grafana-nav-overlay-open.png`,
  `grafana-breadcrumbs-folder.png` — live `play.grafana.org` captures of the closed,
  overlay-open, and folder-page breadcrumb states, opened and verified
- `reference/grafana-theme-drawer-dashboard-wide.png` — live `play.grafana.org`
  capture, wide viewport, theme-selector modal open; kept for the exposed sliver of
  top-bar/breadcrumb only, not for content-width evidence (see Q6 caveat)
