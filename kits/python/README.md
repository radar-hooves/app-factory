# kits/python

Shared Python app code, published to the household's private index and consumed as an ordinary dependency, never copied into an app. Same rule as [`kits/rust`](../rust/README.md): the stamped skeleton stays thin, and a kit holds what every app would otherwise carry a copy of.

## Packages

- [`agent-common`](agent-common) — the household's Claude Code agent: `cli` (the driver: argv, environment, a spawn in its own process group, the idle-timeout read loop, the stderr tail, the kill, stream-json stdin turns), `persona` (load a persona directory and seed its writable home), `transcript` (read and forget a session as turns), `agent` (the `Agent` interface a chat asks through, and `LocalAgent`) and `sse` (the frame). Design: [`docs/design/agent-console.md`](../../docs/design/agent-console.md). The stamped `api/agent/` slice binds it to the app's settings, data directory and exceptions.

## Depending on a kit

A stamped app already does, in `backend/pyproject.toml`:

```toml
"agent-common>=2026.9.57",
# …
[tool.uv.sources]
agent-common = { index = "<private index name>" }
```

Each release tag publishes every package here at that tag's version (`.github/workflows/publish-kit-python.yaml`), so the floor to pin is the release the change you need landed in.

## Building and testing

The uv workspace is rooted at the repo root (`pyproject.toml`, `uv.lock`), because the shared publish workflow builds the workspace from the checkout's root. From a package directory:

```console
$ uv sync
$ uv run ruff format --check src tests && uv run ruff check src tests
$ uv run mypy src tests
$ uv run pytest
```

CI runs exactly that, and only there, in `.github/workflows/factory-selftest.yaml`, then renders a scratch app that resolves the kit from the same checkout, so kit and stamp are tested together. Ruff takes the root `ruff.toml`, the width a stamped app ships.
