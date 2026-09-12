# Agent console

Status: **design, 12/09/2026.** A stamped app offers its users a chat with a named persona: a `claude -p` session on the household's own login, streamed verbatim to a page. The library runs it for one persona (Milton); Pebblestone needs it for six.

## Decision

**The factory gains an `agent` slice: the session spawn, the verbatim stream, session ownership, the persona contract, the door, and one console route of its own built from `@poodle64/librarian`'s components. Everything that knows what a corpus is stays the library's.** Cost: about 1,050 lines in the factory: 540 lifted from the library's slice, 510 new. Pebblestone drops about 5,700 lines by stamping it; the library keeps its 2,225.

Three clauses of the request are reshaped and one is refused:

- **The login, not a gateway alias.** Measured on atlas: Claude Code through LiteLLM and Claudette narrates a tool call as text and ends the turn having done nothing, so the deployed library authenticates the CLI with `CLAUDE_CODE_OAUTH_TOKEN` vended from the broker and talks to Anthropic directly. The contract is that token on the app process plus a Claude Code model name per persona; the gateway pair stays optional, for a genuinely Anthropic-compatible one. "Gohan's account through thalamus" is Gohan's token on the app, no LiteLLM in the path.
- **Tier is an entitlement.** The door is the factory's own: `CurrentUser` plus `require_module("agent-<name>")`, one Authentik entitlement per persona, no tier code. Pebblestone's director and employee tiers become grants, as its handoff already decided.
- **The redactor is an app hook.** `app_hooks.agent_turn(persona, user, text)` is optional and absent by default; Pebblestone's returns redactyl's output. The factory redacts nothing itself.
- **Refused: a per-turn prompt or working directory.** The library composes Milton's prompt per question and builds a scoped view per asker. That is a reading room, not a chat: it stays a library-owned route importing the factory's spawn and ownership modules, rather than two more seams carried for one consumer.

## The persona contract

A persona is a directory shaped as a Claude Code home: `CLAUDE.md` (who it is), `settings.json` (`model`, `permissions.allow`, `permissions.deny`, hooks) and `.mcp.json` (the servers it holds: the app's own `/mcp`, the library, named fleet servers). The alias is settings.json's own `model` key; there is no fourth file. Defaults live in the app at `config/personas/<name>/`, app-owned like `config/actors.yaml`; `<APP>_AGENT_PERSONAS_DIR` names an overriding directory, read at every spawn, so an edit reaches the next turn without a restart. The factory seeds a writable home per persona under `data/` on first use, because Claude Code writes to its home. The tool lists reach the CLI as `--allowedTools` and `--disallowedTools` from that same file, so file and flags cannot disagree; Pebblestone's personas deny every file tool. An app with no persona directory renders no console.

```d2
direction: right
factory: "Factory (byte-identical)" {
  console: "routes/agent/[persona]"
  door: "POST /api/agent/{persona}/ask\nCurrentUser + entitlement"
  stream: "SSE frames, verbatim\nclaim on init, deny a foreign resume"
  session: "session.py\nargv, env, spawn"
  persona: "persona.py\nload dir, seed home"
  ownership: "agent_sessions"
  cli: "Dockerfile: pinned claude"
}
app: "App-owned" {
  personas: "config/personas/<name>/\nCLAUDE.md, settings.json, .mcp.json"
  hook: "app_hooks.agent_turn\n(redactor, or absent)"
  actors: "config/actors.yaml\none row per persona"
}
library: "Library only" {
  ask: "ask.py, cascade, scope, reach"
  extras: "citations, attachments,\ntranscript, conversation, caller door"
}
outside: "Elsewhere" {
  pkg: "@poodle64/librarian\n(design-system)"
  claude: "claude -p\nCLAUDE_CODE_OAUTH_TOKEN"
  mcp: "app /mcp, library, fleet servers"
}
outside.pkg -> factory.console
factory.console -> factory.door -> app.hook -> factory.stream -> factory.session -> outside.claude
factory.session -> factory.persona -> app.personas
factory.stream -> factory.ownership
outside.claude -> outside.mcp: "via .mcp.json"
outside.mcp -> app.actors
library.ask -> factory.session
library.ask -> factory.ownership
library.ask -> library.extras
```

## The count, from source

| Repo | Moved | Kept | Deleted | New |
| --- | --- | --- | --- | --- |
| template | 540 in: `session.py` 194, `ownership.py` 147 and its migration 47, `settings.json` 5, the gateway and home fields of `config.py` 70, the Dockerfile CLI stanza 18, the argv and env tests 60 | | | 510: persona loader, ask route and SSE framing, persona list, console page, hook seam, slice test |
| library | 540 out, back as factory copies | 2,225: `ask.py`, `cascade.py`, `scope.py`, `reach.py`, `citations.py`, `attachments.py`, `transcript.py`, `conversation.py`, the corpus routes, `librarian.md`, the page | 0 | 0 |
| pebblestone | 0 | 545: digests and action cards (`services/chat.py`, models, schemas, posting routes); memory and consultation re-home as tools on its `/mcp`, about 200 | 5,700: `openai_adapter.py` 571, its settings 39 and tests 611; `orchestrator.py` 1,693 and `personas.py` 114 with their tests 2,124; the send and stream routes 250; the chat page 77; Open WebUI in compose 96 and its runbook 158 | six persona directories (Penny's `CLAUDE.md` is A02, 146 lines, `@`-importing A01, A03 and A04) and a fifteen-line hook |

## Sequence, each chunk proven before the next

1. **Factory.** The slice, the console route, the CLI in the Dockerfile body, the sanctioned-per-app entry for `config/personas/`, one test driving a fake CLI through argv, env, ownership and SSE framing. Proven by a fresh stamp talking to one persona on the operator's login. Tag.
2. **Library re-stamps.** Takes the six factory files, deletes its copies and its Dockerfile tail stanza, points `ask.py` at the factory modules, regenerates its parity manifest in the same commit. Proven by its own suite and one live ask on atlas.
3. **Pebblestone stamps.** Slice, six persona directories, the redactor hook, six entitlements in Authentik, an actor row per persona. Proven by one director conversation with Penny through the console on titan. Then Open WebUI, the adapter and the orchestrator loop go in one commit with their tests, service and runbook.

## Open question

**Whose identity does a persona carry onto its own app's `/mcp`?** An actor row of its own reaches the app persona-wide, outside the asker's workspace; acting as the asker keeps tenancy intact but needs the machine door to accept a person's identity, which it does not. Recommended: the actor row, zero new machinery, because Pebblestone's personas hold the knowledge layer rather than workspace rows. Revisit when a persona first needs a workspace-scoped table.
