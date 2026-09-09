# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is CalVer (`YYYY.M.x`).

## [2026.9.6] - 2026-09-09

### Changed

- **Every user-visible string now presents Milton as a person, not the
  library's architecture** (`rules-library/platform/canonical-app-shape.md`
  §Milton is a person, not a place). On cadmus production the activity
  summary read "1 search · 2 documents read · 1 collection" and the working
  indicator and tool rows described the mechanics — both violations.
  - `summariseActivity()` drops the collection count; counts of searches and
    documents read stay ("1 search · 2 documents read").
  - `describe()` (the tool-row label) never returns a tool's name or a raw
    path/pattern for an unrecognised call; every branch returns a reader
    verb instead ("Read", "Looked for", "Looked for documents", "Looked
    through the library", "Checked", "Looked into it").
  - `ToolRow`'s expanded state no longer prints the tool name and raw
    command/path line; it still shows the tool's real result.
  - `Working`'s cycling placeholder is now exactly "Milton is looking…" /
    "Milton is reading…", dropping "Reading the shelves" (a forbidden
    architecture noun) and the rest of the whimsical word list.
  - `Composer`'s placeholder defaults to "Ask Milton…" (was "Ask anything")
    and its unscoped chip reads "The whole library" (was "All
    collections").
  - The stream-failure error frame reads "Milton can't be reached right
    now." in both `client.ts` (was "The agent answered `<status>`.") and
    `transcript.svelte.ts`'s `library_error` fallback (was "the agent
    failed").
    Event handling and component structure are unchanged — copy only. Pinned
    by `src/test/transcript.test.ts`, `src/test/tool-row.test.ts`,
    `src/test/working.test.ts`, `src/test/activity-group.test.ts`, and the
    extended `src/test/composer.test.ts`.

## [2026.9.5] - 2026-09-09

### Fixed

- **2026.9.4 shipped its own test file inside the published package.**
  `composer.test.ts` was co-located beside `composer.svelte` inside
  `src/lib`, which `svelte-package` packages wholesale — `dist/` (and the
  npm tarball) carried `composer.test.js` alongside the component. Moved to
  `src/test/composer.test.ts`, matching `@poodle64/ui`'s convention of
  keeping every test outside `src/lib` for exactly this reason. No
  behaviour change; 2026.9.4 is otherwise identical and was not deprecated
  on npm, but a consumer should take 2026.9.5.

## [2026.9.4] - 2026-09-09

### Fixed

- **`Composer` rendered its "All collections" scope chip even for a
  fixed-scope consumer.** A room with one shelf set never passes
  `documentName` or `collectionName`, which used to leave "All collections"
  as the sole entry in the chip row — console furniture with nothing to
  switch to. The chip row now renders only once there are two or more
  scopes to pick between; a fixed-scope consumer gets no chip and no space
  where it was. Covered by `src/test/composer.test.ts`, the package's first
  component test (also adds `src/test/setup.ts` and wires
  `vitest.config.ts`'s `setupFiles`, per `sveltekit-testing.md`).

## [2026.9.3] - 2026-09-09

### Fixed

- **A long citation title clipped at the edge on a phone.** The `Markdown`
  component's inline `code` span — how a citation's document title renders
  in running text — carried `white-space: nowrap` with no scroll wrapper, so
  a title longer than the container cut off at 390px with no way to read the
  rest, contained (no page scroll) but silently truncated. It now wraps at
  word boundaries (`white-space: normal; overflow-wrap: anywhere`), the same
  in-flow treatment as the prose around it; `@poodle64/ui`'s `.ds-prose`
  scroll-in-its-own-box pattern is reserved for wide block content (a table),
  not an inline identifier sitting inside a sentence. Verified at 390×844
  with a citation title long enough to force both a word wrap and, with no
  spaces at all, a mid-word break — no clipping, no horizontal scroll.
