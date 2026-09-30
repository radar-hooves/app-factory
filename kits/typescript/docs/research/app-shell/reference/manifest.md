# App Shell Chrome — Reference Manifest

Third-party screenshots, internal design reference only; not redistributed.

Visual ground truth for the shell (left nav rail + top bar) of a dense financial console. Gathered 10/08/2026; **curated 10/08/2026** — eleven were downloaded, all eleven opened, four deleted (§Deleted). Seven survive.

Every row below carries what the image actually teaches, read off the pixels rather than off its source page's caption. A row without a lesson is a row that should have been deleted.

## The set

| File | What it teaches | Shows | Source | Date |
| --- | --- | --- | --- | --- |
| `linear-sidebar-full.png` | **The rail, verbatim.** Quiet collapsible section headers (`Workspace ▾`, `Favorites ▾`, `Your teams ▾`) chunk a long list; the active item (`Mobile App`) is a light grey wash and _nothing else_ — no accent, no bar, no border. Head carries brand + workspace chevron left, search and compose right. Vendor's own alignment guides are overlaid, so the gutters are readable directly. | Sidebar crop with annotation guides | Linear Blog, "How we redesigned the Linear UI" (`linear.app/blog/how-we-redesigned-the-linear-ui`) | Post undated at scrape |
| `linear-shell-full-topbar-breadcrumb.png` | **Breadcrumb lives in the content column's own header, not a global bar** — `Product › Insights › LIN-1305` sits above the detail pane, with filter icons over the list pane. ⚠️ **Skewed 3-D marketing render: read placement only, never proportion, spacing or density.** | Three-pane window at an angle | Same post as above | Same |
| `notion-sidebar-full-collapse-affordance.png` | **Collapse belongs at the rail's own top edge** — `«` at the sidebar's top-right, icon-only, no label. Both ends of the top bar are anchored: back/forward/+/page-title left, Share/comments/history/star/⋯ hard right. Active page = grey wash. Sections `Private`/`Shared`/`Teamspaces`/`Favorites`. ⚠️ Carries a red help-centre arrow and a tinted popover — annotation cruft, not UI. | Full window, sidebar + top bar | Notion Help, "Navigate Notion with the sidebar" (`notion.com/help/navigate-with-the-sidebar`) | Retrieved 10/08/2026; page undated |
| `github-topbar-breadcrumb-tabs.png` | **The two-row model, and the best image in the set.** Row 1: mark + breadcrumb `stripe / react-stripe-js` (owner muted, repo bold) left; search, `+`, notifications, avatar hard right. Row 2: peer views as underline tabs (`Code · Issues 21 · Pull requests 3 · …`), active marked by a 2px accent underline and bolder label, counts as quiet badges. Nothing floats in the middle. | Cropped top bar over a marketing gradient | GitHub changelog, "Redesigned navigation available in Public Beta" (`github.blog/changelog/2023-04-05-redesigned-navigation-available-in-public-beta/`) | 05/04/2023 |
| `vercel-shell-topbar-scope-switcher-light.png` | **Peer-view tabs sit inside the content column, and the active one is a filled grey pill** — not an underline. Also: scope switchers stack (`Acme Pro` in the rail head, `site` in the content head), search is an input _inside_ the rail with an `F` hint, and the active nav item (`Deployments`) is a rounded grey wash with no accent bar. Contradicts "nobody uses a filled tab" — see the dossier. | Top-left crop of the dashboard | Vercel changelog, "New dashboard redesign is now the default" (`vercel.com/changelog/dashboard-navigation-redesign-rollout`) | 26/02/2026 |
| `grafana-sidebar-megamenu-many-items.png` | **The closest structural match to what Godswood needs.** Row 1: logo, search, global actions. Row 2: hamburger + breadcrumb (`Home › Dashboards › GrafanaCloud › Usage Insights…`) left, and **view-scope controls right** — `Last 24 hours`, zoom, refresh, kebab. That right-hand half of the context row is exactly the persistent filter bar the securities dossier asked for. Also the counter-example on active state: Grafana marks it with an **orange left bar**, not a wash. | Dense dark console, rail + two-row top | Grafana docs, "What's new in Grafana v9.5" (`grafana.com/docs/grafana/latest/whatsnew/whats-new-in-v9-5/`) | Documents v9.4 navigation |
| `attio-shell-sidebar-full-topbar-scope-switcher.png` | **The nearest peer available with Stripe missing** — a dense record console. Rail: workspace switcher + panel-toggle at the head's right, search input with `⌘K`, a flat action list, then grouped `Records ▾` / `Lists ▾` / `Chats ▾`, foot = invite + avatar. Active record (`Companies`) is a grey wash with a tinted icon, single-marked. Content head stacks title, then a scope row (`All Companies ▾`, `View settings`), then a filter row (`Sorted by…`, `Filter`) — three altitudes, each thinner than the last. ⚠️ Provenance thin (see below). | Full shell, ~625px wide, dense | Attio's Storyblok CDN asset (`a.storyblok.com/f/234930/626x921/…`), reached via a search-result thumbnail | Not recorded |

## Deleted in curation

Named here so a later pass does not re-fetch them.

- `github-sidebar-flyout-toggle-in-head.png` — **contradicted its own caption and taught nothing.** It shows a temporary flyout overlay with an `✕` close, over an otherwise empty grey page; it does _not_ show a persistent rail or "a toggle in the head beside the mark", which is what the dossier cited it for. Roughly 60% of the frame is blank. Notion covers the head-mounted collapse better.
- `vercel-shell-topbar-scope-switcher-dark.png` — near-duplicate of the light version, identical layout, recoloured. Godswood has its own warm palette, so Vercel's dark greys are not a colour reference either.
- `figma-shell-toolbar-contextual-panels.png` — **marketing composite, not product UI.** Disconnected floating panels (context menu, colour sliders, tool palette, an illustrated cursor) arranged on a grey field, with no rail, top bar or breadcrumb anywhere in it. Figma is a canvas tool with floating chrome — the wrong reference class entirely.
- `attio-sidebar-lists-panel.png` — a list-search popover, a feature Godswood's brief does not have. Near-duplicate of the fuller Attio shot, which shows the same rail better.

## Gaps — wanted, not captured

- **Stripe Dashboard** — the closest peer to a dense financial console, and still the single most valuable image missing. No legible current shell screenshot exists publicly: the newsroom media kit carries logos and executive photos only, `docs.stripe.com` guide pages render the dashboard client-side so it is absent from the initial HTML, and the marketing pages use abstract gradient art. **A manual capture from a live account is the way to close this**, not another scrape.
- **Sentry** — `sentry.io`, `blog.sentry.io` and `docs.sentry.io` refused the scraper at the network level on every attempt.
- **Height / Superhuman** — Height refused the connection; Superhuman's only usable image is a 2022 marketing composite with no shell chrome.
- **Raycast / Arc** — Raycast's available screenshots are a command palette and a floating note card; neither shows a collapsed icon-only rail. Arc was not attempted.
- **Retool** — only its in-app "Sidebar frame" component (a building block for apps built _in_ Retool) was findable, not Retool's own IDE shell. Attio covers this brief instead.

## Provenance caveat on the Attio image

It was reached through a search-result asset URL on Attio's CDN, not a scrape of a named Attio page, so the publishing article and date are unrecorded. The UI is unmistakably genuine and legible, so it is kept — but flagged rather than presented as fully sourced.
