---
template-version: "2026-07-17"
---

# App Factory: Product Intent

## Problem Statement

Apps built from one shape drift apart quietly. Every variant compiles, type-checks and passes its tests, so no gate sees it. Measured 14/08/2026 across ten apps: 125 files that should have been 13 carbon copies were 62 distinct versions (README).

## Value Proposition

One copier source for every household full-stack app: FastAPI backend, SvelteKit SPA and embedded MCP surface, shipped as one container. A fix lands once here and reaches every app. A gate fails an app that edits what the factory owns, and an app that must differ argues it in `.canonical-exceptions`.

## Who consumes it

- **Stamped apps.** Each app is a `copier copy` of a tagged release, then converges on later ones.
- **Desktop apps** (Thoth, Bragi) stamp the desktop skeleton and take shared code as kits.
- **Master-project's tools** (parity gate, converge) read this repo's `template/`, `slices.yaml` and `variants.yaml`.

## Core Principles

1. **Law, executed.** `rules-library/platform/canonical-app-shape.md` states the shape; this repo is its executable form, and the two move together.
2. **A difference that is right is right for every app.** It becomes a copier answer or a slice here, never a per-app file.
3. **A fix lands once.** An app that cannot take it records the exception, dated, with a reason.
4. **Shared code is a kit, not a copy.** Versioned, pinned, consumed through its own API.

## Non-Goals

- **Per-app variants.** The operator ruled 06/11/2026 for no template variants (P09).
- **Domain code.** An app owns its models, routes and views; the factory owns the shape under them.
- **Onboarding documentation.** Docs are written for the next agent here; the file tree, copier questions and dependency list are not transcribed.
- **Releasing from a branch.** A tag is cut by whoever merges.
