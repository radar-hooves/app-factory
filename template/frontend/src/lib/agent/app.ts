/**
 * THIS app's chat pages: the extension point for `routes/(protected)/chat/[persona]`,
 * which the factory owns (`app-factory docs/design/agent-console.md` §Stamped:
 * `api/agent/`). App-owned: copier never overwrites it.
 *
 * Export any of `ChatExtensions`' members (`$lib/agent/chat`) by name:
 * `oncite` (what a citation opens), `describeTool` (how a tool call in an
 * answer reads), `copy` (the words, per persona), `Home` (a component on a new
 * conversation, inside its scroll), `Turn` (a component presenting a question
 * and its answer in place of the package's own) and `briefing` (what the
 * composer's briefing control asks, and the card it reads as) and
 * `formatCost` (an answer's cost in this app's own currency and words, from
 * US dollars, "about A$0.34"). The factory's copy exports none, and the page
 * is the package's own.
 */
export {};
