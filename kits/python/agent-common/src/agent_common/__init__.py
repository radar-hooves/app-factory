"""The household's Claude Code agent, shared by every app that runs one.

`cli` drives the CLI, `persona` loads and seeds a persona's home, `transcript`
reads and forgets a session, `agent` is the interface a chat asks through, and
`sse` frames its events. No table, no route and no import from an app: an app
binds these to its own settings, identity and data directory.
"""
