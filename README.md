# full-stack-app template

Canonical household full-stack application shape, stamped by `copier` via `/scaffold-project`. This template is the **executable source of truth** for the shape described in `rules-library/dev-platform/30-canonical-app-shape.md`.

## Shape

```text
<project>/
├── backend/
│   ├── pyproject.toml          uv + src-layout + runtime deps
│   ├── .python-version         3.14
│   ├── .envrc                  direnv: uv sync + activate
│   ├── alembic.ini             migration config (DB URL injected at runtime)
│   ├── alembic/
│   │   ├── env.py              sync or async branch (chosen at generation)
│   │   └── versions/           migration scripts
│   ├── src/<package>/
│   │   ├── main.py             create_app(): lifespan + /mcp mount + SPA serve
│   │   ├── server.py           uvicorn entrypoint (dev)
│   │   ├── logging.py          configure_logging(); never the root logger
│   │   ├── exceptions.py       AppError hierarchy + FastAPI handler
│   │   ├── deps.py             SessionDep, SettingsDep, CurrentUser (Annotated)
│   │   ├── config/
│   │   │   ├── __init__.py     root Settings + lru_cache get_settings()
│   │   │   ├── paths.py        source-tree-relative .env / repo-root lookup
│   │   │   └── sections/
│   │   │       ├── database.py DatabaseSettings (POSTGRES_* env vars)
│   │   │       ├── mcp.py      MCPSettings (<APP>_OIDC_* inbound-auth vars)
│   │   │       └── example.py  Domain-section template (copy per domain)
│   │   ├── db/
│   │   │   ├── base.py         DeclarativeBase + TimestampMixin
│   │   │   ├── session.py      engine + sessionmaker + get_session (sync/async)
│   │   │   └── registry.py     imports all models → Alembic target_metadata
│   │   ├── api/
│   │   │   ├── main.py         api_router aggregator + exception handler registration
│   │   │   └── example/        vertical domain slice
│   │   │       ├── models.py   SQLAlchemy ORM model
│   │   │       ├── schemas.py  Pydantic request/response models
│   │   │       ├── service.py  business logic (no HTTP concerns)
│   │   │       ├── router.py   FastAPI routes
│   │   │       └── dependencies.py  domain-specific Depends() wrappers
│   │   ├── services/           cross-domain shared services
│   │   └── mcp/
│   │       ├── server.py       FastMCP server + health_check tool
│   │       ├── http_auth.py    Authentik bearer gate on /mcp (carbon copy)
│   │       ├── actors.py       identity → Actor allow-list loader (carbon copy)
│   │       └── auth.py         resolve_actor() for the tool layer
│   └── tests/
│       ├── conftest.py         engine + txn-rollback session + httpx.AsyncClient
│       ├── test_mcp_auth.py    drives the /mcp gate: refusals, accept, allow-list
│       └── test_example.py     unit + integration tests for the example slice
├── config/
│   └── actors.yaml             MCP actor allow-list (identity → actor_id/type)
└── frontend/                   (only when has_frontend=true)
    ├── package.json            SvelteKit + shadcn-svelte + Tailwind v4
    ├── svelte.config.js        adapter-static SPA + path aliases
    ├── vite.config.ts          proxy /api → backend, dev auth header injection
    ├── tsconfig.json
    └── src/
        ├── app.css             design tokens (Eucalyptus palette, OKLCH)
        ├── routes/
        │   ├── +layout.ts      ssr=false, prerender=false
        │   ├── +layout.svelte  ModeWatcher + Sonner + page title
        │   ├── +page.ts        { title: 'Home' }
        │   └── +page.svelte    starter home page (API smoke check)
        └── lib/
            └── api/
                ├── client.ts   openapi-fetch client (type-safe, credentials: include)
                └── error.ts    extractApiError() → { title, description, status }
```

## Questions (copier.yml)

| Question | Default | Effect |
| --- | --- | --- |
| `project_name` | — | kebab-case name; used in pyproject.toml, package naming |
| `package_name` | snake_case(project_name) | Python package under `src/` |
| `description` | — | one-sentence description in metadata |
| `has_frontend` | `true` | include the `frontend/` SvelteKit skeleton |
| `db_mode` | `sync` | `sync` (default) or `async` (I/O-fan-out criterion) |

The sync/async choice is isolated to `db/session.py` and `alembic/env.py` so it stays reversible. Record the decision and criterion in the project's ADR.

## Usage

```bash
# Stamp a new project
copier copy docs/master/templates/full-stack-app /path/to/new-project

# Or via the /scaffold-project skill (preferred — sets up symlinks, CLAUDE.md, etc.)
/scaffold-project
```

## Key Decisions

**Auth: two surfaces, two gates, never interchangeable** A stamped app exposes a human surface and a machine surface, and each is gated on its own terms. Mixing them is a bypass, not a shortcut.

The **human surface** (`/api`, the SPA) is Tier 1a (proxy-delegated, the default for homelab apps). Identity arrives via `x-authentik-uid` / `x-authentik-username` headers injected by Authentik. The app trusts headers; network isolation is the security boundary. No app-level sessions or Redis needed. Change to Tier 1b (BFF) when the app must be reachable without a proxy in front of it.

The **machine surface** (`/mcp`) validates a live Authentik OIDC bearer token app-side and resolves it against an `actors.yaml` allow-list. It does *not* trust a forwarded identity header, because a machine caller does not traverse the human proxy and could forge one (`rules-library/auth-patterns/proxy-delegated-auth.md` §Scope). `mcp/http_auth.py` and `mcp/actors.py` are byte-identical carbon copies of the household's canonical gate, shared with godswood, seshat, core-memory, tapestry and milton; do not edit them per app. Both halves are load-bearing: Authentik serves one instance-wide userinfo endpoint that accepts any valid token from any application on the instance, so the bearer check proves identity alone and the allow-list is what restores the app boundary. Every tool calls `resolve_actor()` and authorises off `actor.id` / `actor.type`.

**MCP inbound-auth environment variables** All four are read at runtime, so pointing an app at a different identity provider never needs a rebuild. `<APP>` is the project name upper-cased with hyphens as underscores.

| Variable | Default | Meaning |
| --- | --- | --- |
| `<APP>_OIDC_USERINFO_URL` | `""` | Authentik userinfo endpoint. **Empty fails closed**: every `/mcp` request 401s. |
| `<APP>_OIDC_IDENTITY_CLAIM` | `preferred_username` | Claim read as the caller identity, falling back to `sub`. Deployments behind the shared mcp-gateway client set `mcp_actor`. |
| `<APP>_OIDC_RESOURCE_METADATA_URL` | `""` | Advertised in the 401 `WWW-Authenticate` header (RFC 9728). Empty omits it. |
| `<APP>_ACTORS_CONFIG_PATH` | `config/actors.yaml` | The actor allow-list. An identity the gate resolves but that is absent here is refused. |

The fail-closed default is deliberate. A fresh stamp runs locally with no identity provider configured and its `/mcp` is shut rather than open, and `create_app()` logs a warning naming the variable so the closed state is never a mystery.

**Config: composed sections over one shared `.env`** The root `Settings` owns the unprefixed keys; each section owns its own prefix (`POSTGRES_*`, `EXAMPLE_*`, `<APP>_OIDC_*`). All of them read the same `backend/.env`, so every model must set `extra="ignore"`: a key belonging to a sibling section is not an error, and forbidding it makes the app refuse to start on the very file `.env.example` tells you to copy. Paths come from `config/paths.py` rather than the working directory, because `uvicorn` starts in `backend/` in dev and at the repo root in a container. Follow both conventions when you add a section.

**Persistence: PostgreSQL + SQLAlchemy 2.0 + Alembic** Sync by default; switch to async by setting `db_mode=async` at generation time (not after). The criterion for async: the request path parallelises I/O.

**MCP surface: FastMCP mounted at /mcp, behind the bearer gate** The embedded MCP server shares the FastAPI process and lifespan. Tools are registered in `mcp/server.py`. Target ≤20 tools; use the action-dispatcher pattern (one tool per noun, `action=` parameter). The mount has a subtlety worth knowing before you touch `main.py`: `raw_mcp_app` carries the FastMCP lifespan (the streamable-HTTP session manager's task group lives there) while the gated wrapper is what mounts at `/mcp`. Chain the lifespan from the raw app and mount the gated one. Getting that backwards either leaves the session manager unstarted or leaves the surface open. The agent endpoint is `POST /mcp/`, trailing slash required.

**Frontend: SvelteKit SPA served by the backend** `adapter-static` builds to `frontend/build/`; FastAPI serves it via `StaticFiles(..., html=True)`. The Vite dev server proxies `/api` and `/mcp` to the backend and injects the dev Authentik headers so the same code path runs in both environments. Those injected headers authenticate the human surface only. They carry no weight on `/mcp`, which stays shut until `<APP>_OIDC_USERINFO_URL` is set.

**Design tokens: Eucalyptus palette (OKLCH)** The shared household design language (`docs/master/design/shared-design-language.md`). Update master tokens first, then adopt per project. No raw `oklch()` values in component files — all via CSS custom properties defined in `app.css`.

**Component system: `@poodle64/ui` (shared shadcn-svelte primitives)** The shadcn-svelte primitives (bits-ui) are consumed as a published package, not vendored per app: `import { Button } from '@poodle64/ui/button'`. A fix lands once and reaches every app. Two `app.css` lines make that work, and both are load-bearing: `@import '@poodle64/ui/styles.css'` (after the token imports) brings in the shadcn semantic surface *and* its Tailwind registration, and `@source '../node_modules/@poodle64/ui/dist'` puts the package inside Tailwind's scan. The package's peers that the scaffold actually uses (`bits-ui`, `mode-watcher`, `svelte-sonner`) stay declared in the app's own `package.json`: pnpm resolves an undeclared optional peer into the package's private tree, where app code cannot import it and a second copy would be a `Toaster` that never sees the app's own `toast()` calls. WP-51 Lane WP (`master-project#174`); superseded the earlier vendor-per-app pattern.

**Palette differentiation: `--ds-color-*`, never a hand-written alias layer** An app picks its palette by overriding `--ds-color-primary` (and its pair) in `app.css`; the whole shadcn surface follows, because `@poodle64/ui/styles.css` maps every shadcn name onto a `--ds-*` token. A stamped app must **not** re-declare `--card` / `--popover` / `--muted` / `--accent` / `--input` / `--radius` and friends itself. Doing so was the norm before `@poodle64/ui@2026.7.2` and it silently half-worked: declaring those names as plain custom properties makes the variable exist but never tells Tailwind v4 they are theme colours, so `bg-card`, `bg-muted`, `bg-accent` and `border-input` compile to no rule at all: no build error, no lint hit, no failing test, just classes in the DOM with nothing behind them (`poodle64/design-system#3`). The one part of the surface still owned per app is sidebar and chart colours: the package ships no sidebar or chart component and chrome hue is genuinely an app's own decision, so the scaffold declares and registers those itself.

## Verified Greenfield

Seshat (WP-12) was the first project stamped greenfield from this template, 2026-07-05. That run surfaced seven template bugs — missing answers file, an unrendered `.env.example`, a wrong async Alembic URL, an unwired exception handler, a pytest loop-scope mismatch, several stamped-file formatting failures, and an over-strict conftest guard — all fixed in this template as a direct result.

## Releasing a template change (read this before editing)

This repo is a **copier source**, and `copier update` checks out the **latest git tag** — not the tip of `main`. A change pushed without a tag is therefore invisible to every app: they keep stamping and updating against the previous tag, with no error and no signal that anything was missed.

So a template change is not shipped until it is tagged:

```bash
git tag -a v2026.7.1 -m "Release 2026.7.1"   # CalVer: YYYY.M.x, per rules-library/core/10-git-workflow.md
git push origin main v2026.7.1
```

Tag once per logical change set, not per commit (`10-git-workflow.md` §Release Cadence). Apps then pull the change forward with `copier update`; their `.copier-answers.yml` records which tag they last took.

Tagging by hand is discipline, not a ratchet — the same failure mode `rules-library/dev-platform/20-common-libraries.md` documents for published wheels, where an unbumped version silently served stale code. If template changes ever start missing their tags, the fix is to stamp the tag in CI, not to try harder.

## Where this lives

Authored here; consumed as `gh:poodle64/full-stack-app-template`. The shape it stamps is law in the household's `rules-library/dev-platform/30-canonical-app-shape.md`; this template is that rule's executable form, and the two move together. Extracted from `poodle64/master-project` (history preserved) so that copier has a tagged VCS source — see master-project#161.
