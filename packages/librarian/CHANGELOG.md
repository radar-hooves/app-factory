# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is CalVer (`YYYY.M.x`).

## [2026.9.15] - 2026-09-16

The consuming app's persona is the whole voice, the transcript reads as a
chat, and a failed stream says so (`radar-hooves/design-system#35`, from
Pebblestone's agent console, the director watching a portal drive 16/09/2026).

### Fixed

- **The package's look no longer depends on the consumer's Tailwind config.**
  Every component now carries its own CSS, written against the `--ds-*`
  tokens and compiled by whatever bundler the app already runs. Pebblestone's
  `app.css` has an `@source` line for `@poodle64/ui` and never had one for
  this package, so NONE of its utilities compiled there: no per-turn cards,
  no role distinction, unstyled tables, and `max-w-[46rem]` resolving to
  `max-width: none` — a transcript measured 2302px wide. There was no build
  error, no lint hit and no failing test, and there could not be. The reading
  column's measure is now `--ds-lib-measure` (default `46rem`) in this
  package's own stylesheet, and the console's `app.css` has had its scan line
  REMOVED so the screenshot grid is taken in a consumer that compiles none of
  these classes.
- **A failed stream leaves Send disabled no longer.** `ask()` never throws:
  a `fetch` the browser blocks on CORS after an expired session redirects it,
  a 200 that is a login page rather than an event stream, a connection that
  dies mid-answer and a stream that ends with no terminal frame all yield one
  `library_error` and finish the iteration, which is what runs the host's
  `finally` and re-enables its composer. The turn shows the unreachable line
  and offers "Ask again". An abort the reader asked for stays silent.
- **No string in this package names a persona.** `working.svelte` hardcoded
  "Milton is looking" / "Milton is reading" and rendered with no props;
  `notHeld` and `answerFailed` named him in plain text; only `unreachable`
  was ever composed. Penny told Pebblestone's director "Milton is looking" on
  every question she was asked, and said Milton had answered without a source
  on nearly every answer.

### Added

- **`copyFor(name)` and `personaName(name)`** in `@poodle64/librarian/copy`.
  `LibrarianCopy` gains `welcome`, `askPlaceholder`, `answeringPlaceholder`,
  `working` (the cycling words) and `conversationLabel`, so the persona's name
  reaches every sentence the package renders. `resolveCopy(overrides, name)`
  takes the name too; a host's explicit override still wins. The copy is
  pronoun-free: the persona is whoever the app says it is, and a sentence that
  guesses is wrong for half of them.
- **A display name from a slug.** `name="penny"` renders "Penny",
  `chief-engineer` renders "Chief Engineer", and a name with any capital in it
  is left exactly as the host wrote it. The consuming app passes
  `page.params.persona`, which is the slug.
- **A transcript that reads as a chat.** Each turn is the reader's bubble
  against the trailing edge and a bounded answer card under it, signed with
  the persona's name, its avatar initial and the time; markdown tables gained
  zebra striping; a caret blinks at the end of the streaming text; and the
  composer sits on the app's own background behind a hairline, off the scroll
  area.
- **`Turn.at`** (epoch ms), rendered as a clock time distinct from the
  duration badge. A host that persists conversations supplies it; one that
  does not gets a stamp when the turn first appears, and a turn already on
  screen at mount shows none rather than claiming it was asked today.
- **`Outcome.unreachable`**, the fact behind the unreachable sentence.
  `client.ts` has no persona to name, so it reports the failure and the
  rendering layer says it in the right voice — replacing the sentinel that
  compared `outcome.error` against `DEFAULT_COPY.unreachable` verbatim.
- **`SourceList`** (`@poodle64/librarian/source-list`), the source rows the
  transcript and the artefact pane had each been rendering for themselves.
- Two more lab states, `chat` (three settled turns) and `persona` (the same
  surface answering as Penny), photographed like the rest.

## [2026.9.14] - 2026-09-13

A second persona needs the same surface (`radar-hooves/library#133`, dispatched
from pebblestone's night-shift session, `pebblestone#784`):
pebblestone's boardroom renders "Conversation with Milton" for Penny.

### Added

- **`name` on `Composer` and `Conversation`**, default `'Milton'`: every label
  that names the librarian takes it — the composer placeholder in both states
  (`Ask {name}…`, `{name} is answering…`), the conversation's aria-label
  (`Conversation with {name}`), the `welcome` default, and the unreachable
  alert. The library's own console passes nothing and keeps rendering Milton
  unchanged. `LibrarianCopy.unreachable` is the new copy key behind the last
  one — `client.ts`'s stream layer has no `name` to compose with, so
  `Conversation` swaps its own default text in wherever the stream's own
  default comes back verbatim, and a host's explicit `copy.unreachable` still
  wins over the name-composed one.

## [2026.9.11] - 2026-09-11

Milton's between-tool narration was rendering as the answer
(`radar-hooves/cadmus#114`). Measured on production 11/09/2026, cadmus
2026.9.13 on @poodle64/librarian 2026.9.10.

### Fixed

- **Narration read as answer prose, unfolded, at the top of every answer.**
  The caller stream carries no `thinking` content blocks at all, so "Let me
  also check if there's any provision for cashing out while still serving, to
  be thorough" arrives as an ordinary `text` block — identical to the answer
  in every way except POSITION. `segment()` pushed every text block as prose
  and closed the activity group under it, so a reader got Milton's working-out
  as his first paragraph and a second activity line beneath it. It now reads
  the position: a text block with any tool call still to come in the turn is
  narration and folds into the activity group as a thinking-shaped row, folded
  by default exactly as a real `thinking` block is; the run of text after the
  LAST tool call is the answer. `hasAnswer`, the copied answer, the citation
  markers and the "he answered without a source" line all follow it, because
  all four read the segmented text and narration is no longer among it.

  While a turn streams the judgement is provisional and deliberately so: a
  text block that is currently last IS the answer as far as anything can know
  and renders as prose, and the tool call that arrives after it re-homes it
  into the group — which keeps the key it already had, so a disclosure the
  reader opened does not re-mount. Nothing holds state to do that; `segment()`
  is pure and re-derived on every event.

  The cost is an answer Milton interrupts to go back to the shelf: its first
  half folds away. That trade is taken knowingly — position is the only signal
  the stream gives, and a rule read off the prose itself would be
  unexplainable the first time it misfired.

### Changed

- `ActivityStep.block` widens from `ToolBlock | ThinkingBlock` to `Block`, and
  `ThinkingRow` takes a `TextBlock` as well as a `ThinkingBlock`. Both render
  the same row and say the same word: to a reader they are the same thing —
  what Milton was working through, not what he concluded.
- The `narration` state joins the screenshot grid (eleven states now), shot
  with the activity line and the narration row open, because a fold
  photographs as an absence. The driver asserts at every width and both themes
  that the sentence is nowhere in the transcript before that click.

## [2026.9.10] - 2026-09-11

Two defects a fresh-context review found in 2026.9.9; use this one.

### Fixed

- **A run that ended in error was rendering as a clean, complete answer.** Two
  different failures reach a turn and only one of them carries a message: a
  stream that never opened sets `error`, while a run that opened and then
  failed sets `is_error` on its terminal frame and says nothing at all (Claude
  Code's own `error_max_turns` and `error_during_execution` are exactly that
  shape). Reading only `error` gave that second kind no banner, a duration
  badge as though it had finished, and — worst — the new "he answered without a
  source" line, which is a claim about the shelf made off a run that never
  finished looking. All three now read the failure, and a run that failed
  silently says so in the package's own words (`answerFailed`).
- **`formatVerified` accepted a day its month never had**, so a `2026-04-31`
  would have printed "31 Apr 2026". Round-tripped through `Date.UTC` rather
  than bounds-checked against 31.

## [2026.9.9] - 2026-09-10

What a colleague needs to judge an answer, rather than take it on trust
(`radar-hooves/cadmus#114`, the "trust marks and scope statements" and
"follow-up suggestions" lanes). The library released 2026.9.32 carrying the two
frames this reads.

### Added

- **The trust mark.** `Citation.verified_at` — the date the last recheck found
  the document unchanged at its publisher, resolved by the library from its own
  catalogue and never from what the model wrote. The source list and
  `DocumentPane` both render it in words: **verified 23 Jun 2026** or **not
  verified**, in the same muted register as the section beside it. Not red: an
  unverified source is not an error, and dressing it as one would have a
  colleague discount a document that is simply new. A citation DERIVED from a
  "## Sources" block carries no mark at all, because there is no catalogued
  document behind it and "not verified" would be a claim about a record nothing
  here ever read. The date is read off the string rather than through `Date`,
  which would show every reader west of Greenwich the day before.
- **A "not held" line** under an answer that settled having cited nothing:
  "Milton answered this one without a source. He may not hold a document that
  covers it." Gated on the turn's own `outcome`, not merely an empty citation
  list — a turn read back out of `createHistory()` has no citations because
  history stores none, and an answer that cited three documents would otherwise
  come back labelled as holding nothing.
- **`ScopeStatement`** (`@poodle64/librarian/scope-statement`), reached through
  `Conversation`'s `scope` prop: what this room answers from and what it does
  not hold, in the host's own words. It leads while the surface is empty and
  folds to one line as soon as there is a conversation over it — a boundary a
  reader has already read is a banner in the way — and that line reopens it.
- **Follow-up chips** from the library's `suggestions` frame
  (`Transcript.suggestions`, `Turn.suggestions`), offered under the last answer
  and asked through `onsuggest`. Clicking one takes the whole row with it: the
  moment between the click and the new turn arriving is long enough to ask a
  second question by mistake. Without an `onsuggest` handler they do not render
  at all.
- **`@poodle64/librarian/copy`**: every user-visible string this package
  renders, in one module, with `resolveCopy()` merging a host's partial over
  it. A key passed as `undefined` is dropped rather than spread, which is the
  shape a host produces from state that has not loaded yet.
- Two more lab states (`sources`, `not-held`) and two more assertions in
  `scripts/screenshots.mjs`: that the scope statement folds and reopens from
  the keyboard at 390, and that a used follow-up row stops offering its other
  questions.

### Changed

- `AgentEvent.items` is `Citation[] | string[]` — the library's two trailing
  frames share the key and not the shape, so `Transcript.apply` keeps only what
  each frame's own shape admits.

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
