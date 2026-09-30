/**
 * THIS app's room pages: the extension point for `routes/rooms/[room]`,
 * which the factory owns (`docs/design/agent-console.md` §Stamped:
 * `api/agent/`). App-owned: copier never overwrites it.
 *
 * Export any of `RoomExtensions`' members (`$lib/agent/rooms`) by name:
 * `oncite` (what a citation opens), `describeTool` (how a tool call in an
 * answer reads), `copy` (the words, per room), `Home` (a component on a new
 * conversation, inside its scroll), `Turn` (a component presenting a question
 * and its answer in place of the package's own) and `briefing` (what the
 * composer's briefing control asks, and the card it reads as). The factory's
 * copy exports none, and the page is the package's own.
 */
export {};
