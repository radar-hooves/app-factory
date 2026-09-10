# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is CalVer (`YYYY.M.x`).

## [2026.9.8] - 2026-09-10

The colleague-facing bar for Ask Milton (`radar-hooves/cadmus#113`): nothing
missing and nothing odd to someone who uses Claude.ai or ChatGPT every day.
2026.9.7 is the same work with four defects a fresh-context review then found;
use this one.

### Added

- **`Conversation`** (`@poodle64/librarian/conversation`) owns the scroll
  container, and that is why it exists: follow-scroll, the jump-to-latest pill
  and a source pane that narrows the transcript rather than covering it are one
  question — where the overflow lives — and three hosts answering it separately
  is three answers. It also renders the empty state (a welcome and up to three
  example questions as pills) and takes the composer as a snippet, so the pane
  narrows that too.
- **`FollowScroll`** (`@poodle64/librarian/follow-scroll`): follows the stream
  until the reader scrolls up, then stops until they come back to the bottom or
  ask something new. Growing content moves the bottom away from a parked reader
  without moving their `scrollTop`, so direction — not distance — is what says
  who moved.
- **Citations** (`@poodle64/librarian/citations`): inline `[n]` markers become
  chips, marked over the rendered DOM rather than the markdown string, so a
  `[3]` inside a code fence or a link label is not one. A Sources list sits
  under the answer. Fed by the library's `citations` frame
  (`Transcript.citations`), and until that ships everywhere, DERIVED from a
  trailing "## Sources" block — those chips render and read, and are inert,
  because a title and a section are not an id.
- **`DocumentPane`** (`@poodle64/librarian/document-pane`): the cited document
  open at the cited section, as a resizable ~40% column at `lg` and a bottom
  sheet below it, one element and one class list. Reads through a host-supplied
  `loadDocument(document_id)`, because the library's document read is
  authenticated and a package that called it directly would be reaching past
  the app's own proxy.
- **Attachments** (`@poodle64/librarian/attachments`): a paperclip taking PNG,
  JPEG, WebP, PDF, DOCX, plain text and markdown, ten files of 20 MB, as chips
  with name, size and remove. `ask()` posts multipart (`question`, `resume`,
  `collections[]`, `files[]`) whenever files are present and JSON when they are
  not.
- **`readerQuestion()`**: strips the system preamble a host prepends (cadmus
  sends `{room.preamble}\n\n{question}`) before the question renders. The last
  paragraph is never dropped, so "You are wrong about the leave rule" still
  shows.
- **The state lab and its screenshot grid**: `packages/console/src/routes/librarian`
  renders eight states from fixtures; `scripts/screenshots.mjs` photographs them
  at 390/768/1440 in both themes into `docs/screenshots/`, and asserts what a
  screenshot cannot — nothing scrolls sideways at any width, and the source pane
  opens from the keyboard, resizes, and returns focus to the chip on close.

### Changed

- Answers sit at a 72ch reading measure; the leading status dot is gone.
- Activity is ONE quiet line in every state — "Working…" while it runs, a count
  of what was done once it settles — with the steps behind a disclosure. It was
  a live stack of rows, which is the running "let me check…" commentary Milton
  is under instruction never to write.
- The composer grows to six lines then scrolls, disables itself while streaming
  with a Stop button in place of Send, and rises above a phone keyboard using
  `visualViewport` with safe-area padding. Focus returns to it when the answer
  finishes: a disabled element cannot hold focus, so the transition out of
  `running` is the hook, not the send.
- Copy and "Ask again" on a settled answer; "Ask again" alone on a failed one,
  which is the only thing a reader wants from one.

### Fixed

- An answer arriving as SEVERAL text blocks with a tool call between them — the
  ordinary shape of Milton going back to the shelf mid-answer — printed every
  earlier block twice: the Sources block was lifted off the joined text and the
  result substituted back into the last block.
- `splitSources()` cut from the "## Sources" heading to the end of the string,
  dropping anything written after the source list. It runs to the next heading
  and keeps the tail.
- `citationMarkers()` lost the first of an adjacent pair (`[1][2]`), because a
  lookahead rejected `[1]` and `matchAll` resumes after a failed attempt rather
  than backtracking — so `1` rendered as dead text beside a live `2`.
- The transcript is a polite live region whose subtree is REPLACED on every
  token rather than appended to, handing a screen reader the whole answer again
  dozens of times a second. `aria-busy` while streaming holds the announcement
  until the answer has arrived.
- The source pane was not resizable at all: the drag handle is absolutely
  positioned inside a pane that was `lg:static`, so it had no positioned
  ancestor and landed against something else entirely.
- Three `$effect`s read and wrote one piece of `$state`, which Svelte stops with
  `effect_update_depth_exceeded` — the citation pane never opened.

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
