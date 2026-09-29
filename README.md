# full-stack-app-template

The copier source for every household full-stack app — FastAPI backend, SvelteKit SPA, embedded MCP surface, shipped as one container.

## The Problem

Ten apps built from one shape drift apart quietly. Every variant compiles, type-checks and passes its tests, so the divergence is invisible to every gate there is — it only shows when someone lines two repos up side by side, which nobody does. Measured on 2026-08-14: across ten apps, 125 files that should have been 13 carbon copies were 62 distinct versions.

## The Solution

One factory, and a gate that fails a repo which edits what the factory owns. `rules-library/platform/canonical-app-shape.md` states the shape as law; this repo is that law's executable form, and the two move together. A fix lands once here and reaches every app, and an app that must genuinely differ argues it in `.canonical-exceptions` rather than drifting.

## Installation

Prefer `/scaffold-project`, which also sets up the governance symlinks and `.claude/CLAUDE.md`. To stamp directly:

```bash
copier copy gh:radar-hooves/full-stack-app-template <path>
```

Answers are prompted from `copier.yaml`; ports come from the operator's port registry, never invented.

## Tech Stack

Python 3.14 · FastAPI · SQLAlchemy 2.0 (sync) · Alembic · PostgreSQL · FastMCP · uv — SvelteKit · Tailwind v4 · `@poodle64/ui` · Vite · Vitest · Playwright — Docker · gunicorn · Authentik forward-auth.

## Documentation

Written for the next agent working here, not for onboarding.

| Document | What it covers |
| --- | --- |
| [Working on this template](docs/development/working-on-the-template.md) | **Read before editing `template/`.** The two disciplines that fail silently — untagged changes reach nothing, stale parity manifests measure against an old factory — plus the traps in the shape itself. |
| [Adopting an existing app](docs/development/adopting-an-existing-app.md) | Stamping over a repo that already has an app: the reconcile after the stamp is the job, not the stamp. |
| [Agent console](docs/design/agent-console.md) | Design: the persona chat slice the factory carries, what stays the library's, the persona contract, and the sequence by which the library and Pebblestone take it. |
| [Agent jobs](docs/design/agent-jobs.md) | Design: the app-started persona session beside the chat one, its start/watch/message/stop API, and why `--bg` was rejected |
| [CHANGELOG](CHANGELOG.md) | Every shipped change, with the defect each one closed. |

Deliberately not documented here: the file tree, the copier questions and the dependency list. All three are readable from the repo, and a transcription of them is wrong from the first commit that touches anything.

## Contributing

Authored here, consumed as `gh:radar-hooves/full-stack-app-template`. Extracted from `radar-hooves/master-project` with history preserved so copier has a tagged VCS source (master-project#161). Changes follow `core/rules-approach.md` §"Changing a rule or strategy", the same as the rule they implement.
