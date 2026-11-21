# The household skin (#171)

**Decision:** the kit's look is the household's own skin, D1 below with one move from D2, shipped in `@poodle64/ui` 2026.11.13, `@poodle64/design-tokens` 2026.11.1, `@poodle64/librarian` 2026.11.2 and factory 2026.11.64. **Cost to an app:** one update plus `pnpm exec ds-icons-from-lucide src`.

## The need

The operator, 21/11/2026, relayed by eight's orchestrator: "When I still look at these apps I just feel like they still look AI generated"; "I lose confidence when I look at it and I don't know what way is up or what way is down"; "our icons are shit". He rejected the idea that sharing one foundation is the cause: WordPress sites share one and do not look generated. The foundation stays. Its default skin was shadcn's stock look, which v0, Lovable and Bolt generate.

## What gave it away

What eight's landing redesign had to fight in the kit, read by its orchestrator from its Penpot boards:

- a bordered, shadowed card round every section (`Panel`, `StatCard`, `StatList`, `DetailPanel`, `.ds-edge`);
- a small-caps tracked eyebrow over headings, column heads and rail groups (one recipe in about 15 components);
- tinted pill status chips;
- a dot grid and glow behind every page, on by default;
- Lucide everywhere;
- missing type steps for a caption, a nav label and a mid-size heading.

A pass over the kit for this work found three more: a tinted track with a raised pill for tabs, 10px corners, and an icon in a grey circle on empty states.

## Directions

All three were drawn in HTML on the kit's own tokens and faces, using the same content: eight's road page, dark, 1440px. Penpot was not reachable from the lane (repo MCP allow-list). The references are eight's `docs/branding/references/status-and-rounds/`.

| | From | What it does | Verdict |
| --- | --- | --- | --- |
| D1 open | Linear's project page, GitHub's settings | Answer in the display serif, a facts row, sections as a heading over a hairline, lists split by hairlines, status as a dot and a word | **Picked**: the clearest "which way is up", and the shape eight's orchestrator reached independently |
| D2 tonal | Home Assistant, Plausible | Borderless tonal cards, accent duotone icons, a strip of stat tiles | Its rail icons kept; equal tiles and an icon on every heading are on the banned list |
| D3 ruled | Vercel deployments, W&B runs | Ink rules, square corners, monospace metadata | Reads as a developer console, not a household tool |

## What changed

- Sections are open. A surface, where one is needed (`Card`, `DetailPanel`), is a tonal step with no ring or shadow.
- `.ds-label` takes every label, in sentence case.
- Status is a dot and a word. Warning and error colour the word too.
- `PageLead`'s answer is the page's largest type (1.75rem).
- Tabs are underlined.
- The ground is plain: `texture` defaults to `none`.
- Corners: base `--radius` 0.5rem, down from 0.625rem.
- Icons: every Phosphor glyph in duotone (MIT), generated at build. Two paths each, against the six weights a multi-weight Svelte port carries per component. Rail icons take the accent in their tone layer.
- The faces are unchanged. On the operator's Mac the body renders in Avenir Next, and his verdict was formed there, so the face was not the tell.

## Measured

- **Kit:** `svelte-check` reports 0 errors on ui (4513 files), librarian and console. Targeted vitest passes on ui (31 files, 492 tests) and librarian (14 files, 171). The browser harness passes `drive.mjs` 1136/1136 and `graph.mjs` 45/45; locally chromium stood in for WebKit, which CI runs for real.
- **Fresh stamp:** Prettier clean, `svelte-check` 0 errors (2719 files), eslint clean, 7 targeted spec files (81 tests) pass. A Lucide import fails lint, naming the codemod.
- **Real app:** eight, the frontend from its `main` against its live backend, with only the kit swapped and the codemod run (22 files). Compared before and after at 1440 (dark and light) and 390 (dark). The renders hold eight's private content, so they live with eight, not in this public repo.

## Not done here

- The five-second test and a second read by another lab: litellm is not on this repo's MCP allow-list.
- The rule `stacks/sveltekit-frontend.md` still says icons come from `@lucide/svelte`. It is reported against the rule for the next sitting, on the operator's ruling that the icons change.
