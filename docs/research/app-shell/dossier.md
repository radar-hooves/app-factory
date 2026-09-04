# App Shell — Reference Dossier

Visual ground truth for Godswood's shell chrome: the left navigation rail, its head and foot, and the contextual top bar. Paired images: `reference/` (7 after curation, with `manifest.md` carrying provenance and the lesson each one teaches).

This exists because the first pass at the shell inversion was designed from imagination rather than from references, and it showed. What follows is what the references actually do, and where the current build departs from them.

**All eleven gathered images have now been opened.** Four were deleted as worthless (a marketing composite, a near-duplicate, a mostly-blank overlay, an off-brief popover) — `manifest.md` §Deleted records each and why. The four that had gone unread did sharpen this, and in three places contradicted it; those corrections are folded in below and marked **⚑**. **Stripe is still missing** and remains the closest peer to a dense financial console; no legible current shell screenshot exists publicly, so closing that gap needs a manual capture from a live account rather than another scrape.

## The three questions a shell answers

1. **Where am I in the app** — the breadcrumb or section label.
2. **Which view of it am I looking at** — peer views (tabs, lenses).
3. **What is globally available** — search, account, theme, notifications.

Every surveyed product separates these onto different surfaces. The first pass here put all three on one row, which is the root of why it read as three floating widgets rather than a bar.

## What the references agree on

### The top bar is anchored at BOTH ends

GitHub, Notion, Vercel, Grafana and Attio all pin location to the left and global controls to the right.

`github-topbar-breadcrumb-tabs.png` is the clearest: mark, then `stripe / react-stripe-js` with the owner muted and the repo bold; then hard right, search, `+`, notifications, avatar. Notion does the same with page breadcrumb left and Share / comments / history / favourite right.

**⚑ "Nothing floats in the middle" was too strong.** Grafana centres its search field in the global row and anchors everything else at the ends. So the rule is that _location_ and _global controls_ are anchored; a single centred search is a legitimate third position. What is never left floating is a cluster of unrelated controls — which is what the current build has.

**Current build departs:** moving the theme toggle into the rail emptied the right side entirely, leaving everything clustered left with two-thirds of the bar blank. That is the single largest reason it reads as unfinished.

### Peer views are TABS on their own row, not a segmented pill in the global bar

GitHub's `Code · Issues 21 · Pull requests 3 · Discussions · …` sit on a **second row beneath** the global bar, marked by a 2px underline in the accent colour and slightly bolder text. Icons inline, counts as quiet badges. Linear puts view switches in the content column's own header, not the global bar.

**⚑ A filled active tab is not itself the error.** Vercel marks its active peer view (`Deployment`, beside Resources / Source / Open Graph / Bundle Sizes) with a **filled grey pill**, not an underline — so "nobody uses a filled segmented control" was false. What no reference does is put that control in the _global_ bar, or give it a white fill and a shadow that make it the heaviest object on screen. The fill is fine; the weight and the altitude are the fault.

Note also where Vercel and Attio put the row: inside the **content column**, right of the rail, not spanning the full window. Only GitHub spans it, and GitHub has no rail.

**Current build departs:** the `[Overview][Investing]` segmented control has a white active segment with a shadow, making it heavier than the brand, while sitting at the same altitude as the module label and search, so the three compete.

### The collapse control lives in the sidebar HEAD, icon-only

Notion: `«` at the top-right of the sidebar, no label (`notion-sidebar-full-collapse-affordance.png`). Attio: a panel-toggle icon in the same position, right of the workspace switcher. Linear: no persistent control at all.

**⚑ A correction.** This previously cited GitHub for "a toggle in the head beside the mark". Opening that image showed it was a temporary flyout overlay with an `✕` close, not a persistent rail — the claim had been written from the file's caption rather than its pixels. The image is deleted; Attio replaces it, and says the same thing better.

The reasoning is consistent — the control acts on the rail, so it belongs at the rail's own top edge, and it is used rarely enough that it should not carry a nav item's worth of weight.

**Current build departs:** a full-width labelled `Collapse` row at the rail FOOT, directly above the identity row, so the foot carries two stacked rows of chrome and the control reads as a navigation destination.

### The active nav item carries ONE marker

Linear's active favourite, Notion's active page, Vercel's active nav item and Attio's active record all use a **light grey fill and nothing else** — no accent colour, no left bar, no border.

**⚑ Grafana is the exception, and it clarifies the rule.** Grafana marks its active item with an **orange left bar** and a tinted icon — and no fill. So the invariant is not "always a grey wash"; it is **one marker, never two**. Four of five references chose the wash; the fifth chose the bar; none chose both.

**Current build departs:** a saturated green pill **and** a left accent bar — the one thing no reference does. Double marking, in the brand colour, on the busiest surface in the app. Green is meant to mark the one action to take; spending it on "you are here" devalues it everywhere else.

### Long nav lists are grouped under quiet headers

Linear: `Workspace ▾`, `Favorites ▾`, `Your teams ▾`. Notion: `Private`, `Shared`, `Teamspaces`, `Favorites`. Attio: a flat action list first, then `Records ▾`, `Lists ▾`, `Chats ▾`. Small, low-contrast, no border — enough to chunk the list for scanning without adding weight.

Attio's shape is the one to copy here: the handful of items you hit constantly sit ungrouped at the top, and everything else lives under a collapsible header. Eight modules is exactly the count where that starts to pay.

**Current build departs:** eight modules as one flat ungrouped list, so scanning is linear and the rail has no structure.

### Density is tighter than it looks

Measured off the references at their native scale, rows run ~32–36px with a ~10px icon-to-label gutter.

**Current build departs:** ~44px rows with a wide gutter, which is why eight items fill only the top quarter of the rail and leave a void above the foot.

## The corrected shape

Two rows, following GitHub, with Linear and Notion's restraint in the rail.

- **Global bar.** Left: breadcrumb, `Securities / Investing`, module muted and view bold. Right: search, then any global action. Both ends anchored.
- **Context row**, rendered only where a module has peer views. Left: the lens tabs as underline tabs. Right: the scope controls that belong to the whole view (the owner filter, a date range) — which is also the "persistent filter bar above the report" the securities dossier called for from Tradervue and Edgewonk. **⚑ This is now the best-evidenced part of the whole shape**: Grafana puts breadcrumb left and `Last 24 hours` + refresh right on exactly this row, and Attio stacks title → scope row → filter row, each altitude thinner than the one above. It was inference before those two were opened; it is now copied from two working dense consoles.
- **Rail head.** Brand left, collapse toggle right, icon-only.
- **Rail body.** Grouped under quiet headers, tighter rows, neutral active wash.
- **Rail foot.** Identity alone, with the theme toggle beside it — no second row.

### Peer versus drill-down

A tab row is for **peer views** of one section. A drill-down — one property, one document, one trade — is not a peer; it extends the breadcrumb in the global bar instead. Getting this wrong is what turns a tab row into a junk drawer.

## Parity notes

- **Replicate:** the two-row split, both-ends anchoring, underline tabs, head-mounted collapse, neutral active wash, grouped rail sections.
- **Own flair:** the eucalyptus palette and the warm-paper surface ladder — the references are all cool greys, and the warmth is Godswood's, not a defect to correct toward them.
- **Do not copy:** Notion putting search inside the rail as a nav item. Godswood's search is a command palette on ⌘K and belongs in the bar where the references that also have a palette put it.
